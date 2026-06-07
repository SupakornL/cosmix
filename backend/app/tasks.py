from celery import Celery
from .core.config import settings

celery_app = Celery("cosmix", broker=settings.REDIS_URL, backend=settings.REDIS_URL)

@celery_app.task(bind=True, name="process_video")
def process_video_task(self, job_id: str):
    from .core.database import SessionLocal
    from .models.job import Job, JobStatus, AIMode
    from .services.video_service import (
        extract_audio, get_video_duration, add_watermark, apply_auto_cuts
    )
    from .services.ai_service import (
        transcribe_audio, segments_to_srt,
        suggest_cuts, auto_cut_analysis
    )
    import asyncio, os, shutil

    db = SessionLocal()
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        return

    audio_path = None
    try:
        job.status = JobStatus.processing
        job.progress = 5
        db.commit()

        # Download from R2 if needed
        video_path = job.input_s3_key
        if not os.path.exists(video_path):
            from .services.r2_storage import download_file
            local_path = f"/tmp/cosmix_uploads/{job.id}{os.path.splitext(video_path)[1] if '.' in video_path else '.mp4'}"
            os.makedirs("/tmp/cosmix_uploads", exist_ok=True)
            download_file(video_path, local_path)
            video_path = local_path

        duration = get_video_duration(video_path)

        # Step 1: Extract audio
        audio_path = video_path.rsplit(".", 1)[0] + "_audio.mp3"
        extract_audio(video_path, audio_path)
        job.progress = 20
        db.commit()

        # Step 2: Transcribe
        result = asyncio.run(
            transcribe_audio(audio_path, job.subtitle_language or "auto")
        )
        srt = segments_to_srt(result["segments"])
        job.subtitle_srt = srt
        job.progress = 50
        db.commit()

        transcript_text = result["text"]
        base_suggestions = {"words": result.get("words", [])}

        # Step 3: AI analysis by mode
        if job.ai_mode == AIMode.suggest_edits:
            suggestions = asyncio.run(suggest_cuts(transcript_text, duration))
            suggestions["words"] = result.get("words", [])
            job.ai_suggestions = suggestions
            job.progress = 70
            db.commit()

            # For suggest_edits — keep original video, just store suggestions
            output_path = video_path.rsplit(".", 1)[0] + "_output.mp4"
            shutil.copy(video_path, output_path)

        elif job.ai_mode == AIMode.auto_cut:
            # Claude analyzes and returns cuts
            cuts_data = asyncio.run(auto_cut_analysis(transcript_text, duration))
            cuts_data["words"] = result.get("words", [])
            job.ai_suggestions = cuts_data
            job.progress = 65
            db.commit()

            # Apply cuts with ffmpeg
            cuts = cuts_data.get("cuts", [])
            output_path = video_path.rsplit(".", 1)[0] + "_output.mp4"
            
            if cuts:
                cut_video_path = video_path.rsplit(".", 1)[0] + "_cut.mp4"
                apply_auto_cuts(video_path, cuts, cut_video_path)
                # Re-generate SRT for cut video (adjust timestamps)
                # For now, keep original SRT
                shutil.move(cut_video_path, output_path)
            else:
                shutil.copy(video_path, output_path)
            
            job.progress = 85
            db.commit()

        else:
            # subtitle_only / chat_edit
            job.ai_suggestions = base_suggestions
            output_path = video_path.rsplit(".", 1)[0] + "_output.mp4"
            shutil.copy(video_path, output_path)

        # Step 4: Burn subtitle if requested
        burn_sub = False
        sub_style = "white"
        if isinstance(job.ai_suggestions, dict):
            burn_sub = job.ai_suggestions.get("burn_subtitle", False)
            sub_style = job.ai_suggestions.get("subtitle_style", "white")
        
        if burn_sub and job.subtitle_srt:
            import tempfile
            srt_path = output_path.rsplit(".", 1)[0] + ".srt"
            with open(srt_path, "w") as f:
                f.write(job.subtitle_srt)
            burned_path = output_path.rsplit(".", 1)[0] + "_burned.mp4"
            from .services.video_service import burn_subtitles
            burn_subtitles(output_path, srt_path, burned_path)
            os.replace(burned_path, output_path)
            try:
                os.remove(srt_path)
            except:
                pass

        # Step 5: Watermark for trial users
        if job.has_watermark == "True":
            wm_path = video_path.rsplit(".", 1)[0] + "_wm.mp4"
            add_watermark(output_path, wm_path)
            os.replace(wm_path, output_path)

        job.output_s3_key = output_path
        job.progress = 100
        job.status = JobStatus.done
        db.commit()

    except Exception as e:
        job.status = JobStatus.failed
        job.error_message = str(e)
        db.commit()
        raise
    finally:
        db.close()
        if audio_path and os.path.exists(audio_path):
            os.remove(audio_path)
