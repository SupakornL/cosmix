from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
import uuid, aiofiles, os
from datetime import datetime, timezone
from pydantic import BaseModel
from ..core.database import get_db
from ..core.security import decode_token
from ..models.user import User, UserRole
from ..models.job import Job, JobStatus, AIMode
from ..core.limits import get_job_limit
from fastapi.security import OAuth2PasswordBearer

router = APIRouter(prefix="/jobs", tags=["jobs"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

UPLOAD_DIR = "/tmp/cosmix_uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == UserRole.expired:
        raise HTTPException(status_code=402, detail="Trial expired. Please upgrade.")
    return user

@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    ai_mode: AIMode = Form(...),
    subtitle_language: Optional[str] = Form("auto"),
    burn_subtitle: Optional[str] = Form("false"),
    subtitle_style: Optional[str] = Form("white"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Validate file type
    allowed = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"]
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    # Check monthly job limit
    limit = get_job_limit(current_user.role)
    if limit is not None:
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        jobs_this_month = db.query(Job).filter(
            Job.user_id == current_user.id,
            Job.created_at >= month_start,
        ).count()
        if jobs_this_month >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"Monthly job limit reached ({limit} jobs/month). Please upgrade your plan."
            )
    
    # Save file temporarily
    job_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1]
    local_path = f"{UPLOAD_DIR}/{job_id}{file_ext}"
    
    async with aiofiles.open(local_path, "wb") as f:
        content = await file.read()
        await f.write(content)
    
    # Upload to R2
    r2_key = f"uploads/{job_id}{file_ext}"
    try:
        from ..services.r2_storage import upload_file
        upload_file(local_path, r2_key)
        os.remove(local_path)  # cleanup local
    except Exception as e:
        r2_key = local_path  # fallback to local if R2 fails

    # Create job record
    job = Job(
        id=job_id,
        user_id=current_user.id,
        original_filename=file.filename,
        input_s3_key=r2_key,  # R2 key or local path
        ai_mode=ai_mode,
        subtitle_language=subtitle_language,
        status=JobStatus.pending,
        has_watermark=current_user.role in [UserRole.trial],
    )
    db.add(job)
    db.commit()

    # Increment user total_jobs counter
    current_user.total_jobs = str(int(current_user.total_jobs or 0) + 1)
    db.commit()
    
    # Queue processing task
    from ..tasks import process_video_task
    process_video_task.delay(str(job.id))
    
    return {"job_id": str(job.id), "status": "pending"}

@router.get("/{job_id}/status")
def get_job_status(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": str(job.id),
        "status": job.status,
        "progress": job.progress,
        "error": job.error_message,
        "has_watermark": job.has_watermark,
        "subtitle_available": bool(job.subtitle_srt),
        "suggestions": job.ai_suggestions,
    }

@router.get("/{job_id}/subtitle")
def download_subtitle(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job or not job.subtitle_srt:
        raise HTTPException(status_code=404, detail="Subtitle not found")
    
    return StreamingResponse(
        iter([job.subtitle_srt]),
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{job_id}.srt"'},
    )

class ChatMessage(BaseModel):
    message: str
    history: list = []

@router.post("/{job_id}/chat")
async def chat_edit(
    job_id: str,
    body: ChatMessage,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    from ..services.ai_service import chat_edit_command
    transcript = ""
    if job.subtitle_srt:
        transcript = job.subtitle_srt
    
    response = await chat_edit_command(body.message, transcript, body.history)
    return {"response": response}

@router.get("/{job_id}/video")
def get_video(job_id: str, token: str, db: Session = Depends(get_db)):
    from fastapi.responses import RedirectResponse, FileResponse
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401)
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=401)
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(status_code=404)

    video_key = job.output_s3_key or job.input_s3_key
    if not video_key:
        raise HTTPException(status_code=404, detail="Video not found")

    # If it's an R2 key (not a local path), generate presigned URL
    if not os.path.exists(video_key):
        try:
            from ..services.r2_storage import get_presigned_url
            url = get_presigned_url(video_key, expires_in=7200)
            return RedirectResponse(url=url, status_code=302)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Video not accessible: {str(e)}")

    # Fallback: local file with Range support
    from fastapi import Request
    file_size = os.path.getsize(video_key)
    return FileResponse(
        video_key,
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        }
    )

@router.post("/{job_id}/export")
async def export_video(
    job_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from fastapi.responses import FileResponse
    import tempfile, json

    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404)

    r2_key = job.input_s3_key
    if not r2_key:
        raise HTTPException(status_code=404, detail="Source video not found")

    # Download from R2 to local tmp if not already local
    local_dir = "/tmp/cosmix_exports"
    os.makedirs(local_dir, exist_ok=True)
    ext = os.path.splitext(r2_key)[1] or ".mp4"
    video_path = f"{local_dir}/{job_id}_input{ext}"

    if not os.path.exists(video_path):
        try:
            from ..services.r2_storage import download_file
            download_file(r2_key, video_path)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Could not download source video: {str(e)}")

    # Write SRT
    subtitles = body.get("subtitles", [])
    trim = body.get("trim", {})
    subtitle_style = body.get("subtitle_style", {})
    speed = body.get("speed", 1)
    volume = body.get("volume", 1)

    with tempfile.NamedTemporaryFile(suffix=".srt", delete=False, mode='w') as f:
        srt_path = f.name
        for i, sub in enumerate(subtitles, 1):
            def fmt(s):
                h,m,sec,ms = int(s//3600),int((s%3600)//60),int(s%60),int((s-int(s))*1000)
                return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"
            f.write(f"{i}\n{fmt(sub['start'])} --> {fmt(sub['end'])}\n{sub['text']}\n\n")

    output_path = video_path.rsplit(".", 1)[0] + "_export.mp4"

    import subprocess
    cmd = ['ffmpeg', '-i', video_path]
    
    # Trim
    if trim.get('start', 0) > 0:
        cmd += ['-ss', str(trim['start'])]
    if trim.get('end', 0) > 0:
        cmd += ['-to', str(trim['end'])]

    # Build filter
    filters = []
    if subtitles:
        font = subtitle_style.get('fontFamily', 'Arial')
        size = subtitle_style.get('fontSize', 24)
        color = subtitle_style.get('color', '#FFFFFF').replace('#', '&H00') + '&'
        filters.append(f"subtitles={srt_path}:force_style='FontName={font},FontSize={size}'")
    
    if speed != 1:
        filters.append(f"setpts={1/speed}*PTS")

    if filters:
        cmd += ['-vf', ','.join(filters)]

    if volume != 1:
        cmd += ['-af', f'volume={volume}']
    
    if job.has_watermark == "True":
        wm_path = output_path.replace('_export', '_wm')
        cmd += ['-y', output_path]
        subprocess.run(cmd, capture_output=True)
        subprocess.run([
            'ffmpeg', '-i', output_path,
            '-vf', "drawtext=text='COSMIX TRIAL':fontcolor=white@0.6:fontsize=20:x=(w-text_w)/2:y=h-th-20:box=1:boxcolor=black@0.4:boxborderw=6",
            '-codec:a', 'copy', '-y', wm_path
        ], capture_output=True)
        return FileResponse(wm_path, media_type="video/mp4", filename="cosmix_output.mp4")
    else:
        cmd += ['-y', output_path]
        subprocess.run(cmd, capture_output=True)
        return FileResponse(output_path, media_type="video/mp4", filename="cosmix_output.mp4")

@router.get("/{job_id}/words")
def get_word_timestamps(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return word-level timestamps for TikTok-style subtitle rendering."""
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if not job.ai_suggestions:
        raise HTTPException(status_code=404, detail="Word timestamps not available")
    # Word timestamps stored in ai_suggestions under 'words' key
    words = job.ai_suggestions.get("words") if isinstance(job.ai_suggestions, dict) else None
    if not words:
        raise HTTPException(status_code=404, detail="Word timestamps not available")
    return {"words": words}

class SaveSubtitleRequest(BaseModel):
    segments: list

@router.patch("/{job_id}/subtitle")
def save_subtitle(
    job_id: str,
    body: SaveSubtitleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save edited subtitle segments back to DB."""
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == current_user.id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Convert segments to SRT
    def fmt(s: float) -> str:
        h, m, sec, ms = int(s//3600), int((s%3600)//60), int(s%60), round((s%1)*1000)
        return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"

    srt_lines = []
    for i, seg in enumerate(body.segments, 1):
        srt_lines.append(str(i))
        srt_lines.append(f"{fmt(seg['start'])} --> {fmt(seg['end'])}")
        srt_lines.append(seg['text'])
        srt_lines.append("")

    job.subtitle_srt = "\n".join(srt_lines)
    db.commit()
    return {"success": True, "segments": len(body.segments)}
