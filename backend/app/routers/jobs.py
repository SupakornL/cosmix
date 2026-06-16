from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
import uuid, aiofiles, os, re, asyncio
from datetime import datetime, timezone
from pydantic import BaseModel, Field
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

# Per-job locks to serialize concurrent export requests' download-if-missing step
_export_locks: dict[str, asyncio.Lock] = {}

def _get_export_lock(job_id: str) -> asyncio.Lock:
    lock = _export_locks.get(job_id)
    if lock is None:
        lock = asyncio.Lock()
        _export_locks[job_id] = lock
    return lock

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
        # Don't store the ephemeral local /tmp path as input_s3_key — it won't survive
        # a Railway restart and would cause confusing "could not download source video"
        # errors later. Mark the job as failed immediately instead.
        try:
            os.remove(local_path)
        except OSError:
            pass
        job = Job(
            id=job_id,
            user_id=current_user.id,
            original_filename=file.filename,
            input_s3_key=local_path,
            ai_mode=ai_mode,
            subtitle_language=subtitle_language,
            status=JobStatus.failed,
            error_message=f"Failed to upload video to storage: {str(e)}",
            has_watermark=current_user.role in [UserRole.trial],
        )
        db.add(job)
        db.commit()
        raise HTTPException(status_code=502, detail="Failed to upload video to storage. Please try again.")

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

class SubtitleEntry(BaseModel):
    start: float
    end: float
    text: str = ""

class TrimRange(BaseModel):
    start: float = 0
    end: float = 0

class ExportRequest(BaseModel):
    subtitles: list[SubtitleEntry] = []
    subtitle_style: dict = {}
    trim: TrimRange = TrimRange()
    speed: float = Field(default=1.0, gt=0)
    volume: float = Field(default=1.0, ge=0)
    previewWidth: float = 0
    measuredCharWidthPx: float = 0

class AssPreviewRequest(BaseModel):
    subtitles: list[SubtitleEntry] = []
    subtitle_style: dict = {}
    vid_w: int = 1080
    vid_h: int = 1920
    previewWidth: float = 0

def build_ass_content(subtitle_style: dict, subtitles: list, vid_w: int, vid_h: int, preview_width: float = 0, measured_char_width_px: float = 0) -> str:
    """Build the full ASS subtitle file content for the given style/subtitles/resolution.

    Shared by the export pipeline (which writes this to a temp .ass file for ffmpeg's
    ass= filter) and the /ass-preview endpoint (which returns it for client-side
    JASSUB rendering), so both use identical libass output.
    """
    # Parse style
    font = subtitle_style.get('fontFamily', 'Sarabun')
    size = subtitle_style.get('fontSize', 24)
    display_mode = subtitle_style.get('displayMode', 'normal')

    # Some display modes render the active word at a different size than
    # style.fontSize (VideoEditor.tsx wordStyle/word_single/scale_pop spans).
    # Each exported subtitle is shown alone for its time range, i.e. always
    # "active", so apply that mode's active-word size multiplier here.
    if display_mode == 'word_single':
        size *= 1.2
    elif display_mode in ('scale_pop', 'scale_pop_bold'):
        size *= 1.6

    # fontSize is in editor CSS px, sized against the displayed video element —
    # scale it to the source video's real resolution so export matches preview.
    if preview_width and preview_width > 0:
        size = size * (vid_w / preview_width)

    color_hex = subtitle_style.get('color', '#FFFFFF').lstrip('#').upper()
    bold = 1 if subtitle_style.get('bold', True) else 0
    italic = 1 if subtitle_style.get('italic', False) else 0
    position = subtitle_style.get('position', 'bottom')
    bg_opacity = subtitle_style.get('bgOpacity', 0)
    bg_color_hex = subtitle_style.get('bgColor', '#000000').lstrip('#').upper()
    box_style = subtitle_style.get('boxStyle', 'none')
    box_color_hex = subtitle_style.get('boxColor', '#000000').lstrip('#').upper()
    outline_on = subtitle_style.get('outline', True)
    shadow_on = subtitle_style.get('shadow', True)

    font_map = {
        'Sarabun': 'Sarabun', 'Kanit': 'Kanit', 'Prompt': 'Prompt',
        'Mitr': 'Mitr', 'Noto Sans Thai': 'Noto Sans Thai',
        'Chakra Petch': 'Chakra Petch', 'Bai Jamjuree': 'Bai Jamjuree',
        'Arial': 'Arial', 'Inter': 'Inter', 'Impact': 'Impact',
    }
    system_font = font_map.get(font, 'Sarabun')

    # ASS color format: &HAABBGGRR (alpha, blue, green, red)
    def hex_to_ass(hex_str, alpha=0):
        h = hex_str.upper().zfill(6)
        if not re.fullmatch(r'[0-9A-F]{6}', h):
            h = 'FFFFFF'
        r, g, b = h[0:2], h[2:4], h[4:6]
        a = format(alpha, '02X')
        return f"&H{a}{b}{g}{r}"

    primary_color = hex_to_ass(color_hex, 0)

    # Box/background color
    # 'rounded_solid' and 'pill' can't be done with ASS BorderStyle=4 (rectangle only),
    # so we draw the box as a separate rounded-rect vector shape behind the text instead.
    # karaoke_color and scale_pop/scale_pop_bold never render a background box in the
    # editor (gradient-fill text / bare scaled spans), so never draw one for export either.
    no_box_modes = ('karaoke_color', 'scale_pop', 'scale_pop_bold')
    use_drawn_box = box_style in ('rounded_solid', 'pill') and display_mode not in no_box_modes
    css_scale = (vid_w / preview_width) if preview_width else 1
    # Padding/radius values mirror the CSS the editor actually uses per display mode
    # (VideoEditor.tsx wordStyle/word_single/segment box styles), converted to ASS units.
    word_modes = ('word_trail', 'word_pop', 'karaoke', 'karaoke_color')
    if display_mode in word_modes:
        pad_x_css, pad_y_css = 8, 2
        radius_css = 20 if box_style == 'pill' else 6
    else:
        # word_single and normal/segment modes both use the larger box padding
        pad_x_css, pad_y_css = 16, 4
        radius_css = 30 if box_style == 'pill' else 8
    # The editor applies a text drop-shadow (textShadow CSS) independent of boxStyle,
    # so the shadow value should follow shadow_on regardless of which box branch below runs.
    shadow_val = 2 if shadow_on else 0
    if use_drawn_box:
        back_color = "&H00000000"
        border_style = 1
        outline_val = 0
        box_fill_color = hex_to_ass(box_color_hex, 0x22)
    elif box_style != 'none' and display_mode not in no_box_modes:
        back_color = hex_to_ass(box_color_hex, 0)
        border_style = 4  # opaque box
        outline_val = 8   # padding for box
        shadow_val = 0    # BorderStyle=4 doesn't support a separate text shadow
    elif bg_opacity > 0:
        bg_alpha = int((1 - bg_opacity) * 255)
        back_color = hex_to_ass(bg_color_hex, bg_alpha)
        border_style = 4
        outline_val = 6
        shadow_val = 0    # BorderStyle=4 doesn't support a separate text shadow
    else:
        back_color = "&H00000000"
        border_style = 1
        outline_val = 2 if outline_on else 0

    # CSS SubtitleRenderer places the subtitle center at these % from top of the video
    # element (position: absolute; top: X%; transform: translate(-50%,-50%)).
    # Use \an5\pos() for all positions so ASS center matches CSS center exactly.
    preset_center_y_pct = {'bottom': 0.85, 'top': 0.08, 'middle': 0.50}
    alignment = 5
    margin_v = 0  # unused when \pos is always explicit
    center_x = vid_w / 2
    center_y = vid_h * preset_center_y_pct.get(position, 0.85)

    pos_x_pct = subtitle_style.get('posX', 50)
    pos_y_pct = subtitle_style.get('posY', -1)
    use_custom_pos = pos_y_pct != -1
    if use_custom_pos:
        center_x = vid_w * pos_x_pct / 100
        center_y = vid_h * pos_y_pct / 100

    pos_tag = f"\\an5\\pos({center_x:.1f},{center_y:.1f})"

    def fmt_time_ass(s):
        h, m = int(s // 3600), int((s % 3600) // 60)
        sec, cs = int(s % 60), int((s % 1) * 100)
        return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"

    # Write ASS file
    ass_header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {vid_w}
PlayResY: {vid_h}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{system_font},{int(round(size))},{primary_color},&H00FFFFFF,&H00000000,{back_color},{bold},{italic},0,0,100,100,0,0,{border_style},{outline_val},{shadow_val},{alignment},10,10,{margin_v},1
Style: Box,{system_font},{int(round(size))},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ass_lines = [ass_header]
    for sub in subtitles:
        start = fmt_time_ass(sub.start)
        end = fmt_time_ass(sub.end)
        text = sub.text.replace('\n', '\\N')

        if use_drawn_box:
            # Estimate the text's rendered box and draw a rounded rectangle behind it.
            # Thai combining vowel/tone marks (e.g. ิ ี ึ ื ุ ู ั ็ ่ ้ ๊ ๋ ์ ํ) stack on the
            # preceding base character and add no horizontal width, but count toward
            # len() — exclude them so the width estimate matches the rendered text.
            # Note: ิ-ฺ (U+0E34-U+0E3A) deliberately excludes ำ (sara am, U+0E33),
            # which is full-width and DOES take horizontal space — only the
            # combining vowels/tone marks above/below the base character are stripped.
            thai_combining = re.compile('[ัิ-ฺ็-๎]')
            text_lines = text.split('\\N')
            # Use browser-measured char width (canvas.measureText) when available;
            # fall back to 0.62x heuristic for Thai fonts.
            if measured_char_width_px > 0:
                char_w = measured_char_width_px * css_scale
            else:
                char_w = size * 0.62
            text_w = max(
                (len(thai_combining.sub('', l)) * char_w for l in text_lines),
                default=0,
            )
            # Thai line-height needs extra room for tall stacked vowels/tone marks
            # (e.g. ิ์ ๊ ุ) above and below the base line — 1.2x clips them.
            line_h = size * 1.35
            pad_x = pad_x_css * css_scale
            pad_y = pad_y_css * css_scale
            box_w = text_w + 2 * pad_x
            box_h = len(text_lines) * line_h + 2 * pad_y
            radius = min(radius_css * css_scale, box_w / 2, box_h / 2)
            # All positions now use center_x/center_y (set above from CSS % mapping)
            box_x = center_x - box_w / 2
            box_y = center_y - box_h / 2
            # Anchor the text dialogue to the same center point as the box, so the
            # text is always centered inside it regardless of size-estimate drift.
            box_center_x = box_x + box_w / 2
            box_center_y = box_y + box_h / 2
            r, w, h = radius, box_w, box_h
            # Cubic bezier quarter-circle approximation (kappa ≈ 0.5523).
            # Coincident control points (b w 0 w 0 w r) produce angular corners;
            # the kappa form matches CSS border-radius visually.
            k = r * 0.5523
            drawing = (
                f"m {r:.1f} 0 l {w-r:.1f} 0 "
                f"b {w-r+k:.1f} 0 {w:.1f} {k:.1f} {w:.1f} {r:.1f} "
                f"l {w:.1f} {h-r:.1f} "
                f"b {w:.1f} {h-r+k:.1f} {w-r+k:.1f} {h:.1f} {w-r:.1f} {h:.1f} "
                f"l {r:.1f} {h:.1f} "
                f"b {r-k:.1f} {h:.1f} 0 {h-r+k:.1f} 0 {h-r:.1f} "
                f"l 0 {r:.1f} "
                f"b 0 {r-k:.1f} {r-k:.1f} 0 {r:.1f} 0"
            )
            box_alpha, box_bgr = box_fill_color[2:4], box_fill_color[4:10]
            override = f"{{\\an7\\pos({box_x:.1f},{box_y:.1f})\\p1\\1a&H{box_alpha}&\\1c&H{box_bgr}&}}{drawing}{{\\p0}}"
            ass_lines.append(f"Dialogue: 0,{start},{end},Box,,0,0,0,,{override}\n")
            text_prefix = f"{{\\an5\\pos({box_center_x:.1f},{box_center_y:.1f})}}"
            ass_lines.append(f"Dialogue: 1,{start},{end},Default,,0,0,0,,{text_prefix}{text}\n")
        else:
            text_prefix = f"{{{pos_tag}}}"
            ass_lines.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,,{text_prefix}{text}\n")

    return "".join(ass_lines)

@router.post("/ass-preview")
async def ass_preview(
    body: AssPreviewRequest,
    current_user: User = Depends(get_current_user),
):
    """Return the ASS subtitle content for client-side JASSUB preview rendering,
    using the exact same generation logic as the export pipeline."""
    ass_content = build_ass_content(
        subtitle_style=body.subtitle_style,
        subtitles=body.subtitles,
        vid_w=body.vid_w,
        vid_h=body.vid_h,
        preview_width=body.previewWidth,
    )
    return {"ass": ass_content}

@router.post("/{job_id}/export")
async def export_video(
    job_id: str,
    body: ExportRequest,
    background_tasks: BackgroundTasks,
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

    # Serialize the download-if-missing check per job so concurrent export requests
    # for the same job don't both download/use the file while ffmpeg reads it.
    async with _get_export_lock(job_id):
        if not os.path.exists(video_path):
            try:
                from ..services.r2_storage import download_file
                download_file(r2_key, video_path)
            except Exception as e:
                raise HTTPException(status_code=404, detail=f"Could not download source video: {str(e)}")

    # Probe video resolution for accurate ASS positioning
    import subprocess as sp
    probe = sp.run([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'csv=p=0', video_path
    ], capture_output=True, text=True)
    try:
        vid_w, vid_h = [int(x) for x in probe.stdout.strip().split(',')]
    except Exception:
        vid_w, vid_h = 1080, 1920  # fallback portrait

    # Write ASS
    subtitles = body.subtitles
    trim = body.trim
    subtitle_style = body.subtitle_style
    speed = body.speed
    volume = body.volume

    ass_content = build_ass_content(
        subtitle_style=subtitle_style,
        subtitles=subtitles,
        vid_w=vid_w,
        vid_h=vid_h,
        preview_width=body.previewWidth,
        measured_char_width_px=body.measuredCharWidthPx,
    )

    with tempfile.NamedTemporaryFile(suffix=".ass", delete=False, mode='w', encoding='utf-8') as f:
        srt_path = f.name
        f.write(ass_content)

    import time
    ts = int(time.time())
    output_path = video_path.rsplit(".", 1)[0] + f"_export_{ts}.mp4"

    import subprocess
    cmd = ['ffmpeg', '-i', video_path]

    # Trim
    if trim.start > 0:
        cmd += ['-ss', str(trim.start)]
    if trim.end > 0:
        cmd += ['-to', str(trim.end)]

    # Build filter
    filters = []
    if subtitles:
        filters.append(f"ass={srt_path}")
    
    if speed != 1:
        filters.append(f"setpts={1/speed}*PTS")

    if filters:
        cmd += ['-vf', ','.join(filters)]

    if volume != 1:
        cmd += ['-af', f'volume={volume}']

    # Without explicit encoding params ffmpeg falls back to a low-quality default
    # (libx264 ultrafast-ish settings), making the export noticeably blurrier than
    # the source — especially visible on the burned-in subtitle text/shadow edges.
    cmd += ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k']

    def _safe_remove(path):
        try:
            os.remove(path)
        except OSError:
            pass

    background_tasks.add_task(_safe_remove, srt_path)

    if job.has_watermark == "True":
        wm_path = output_path.replace('_export', '_wm')
        cmd += ['-y', output_path]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"[export] ffmpeg failed for job {job_id}: {result.stderr}")
            _safe_remove(srt_path)
            _safe_remove(output_path)
            raise HTTPException(status_code=500, detail="Failed to generate video export")

        background_tasks.add_task(_safe_remove, output_path)
        background_tasks.add_task(_safe_remove, wm_path)

        wm_result = subprocess.run([
            'ffmpeg', '-i', output_path,
            '-vf', "drawtext=text='COSMIX TRIAL':fontcolor=white@0.6:fontsize=20:x=(w-text_w)/2:y=h-th-20:box=1:boxcolor=black@0.4:boxborderw=6",
            '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
            '-codec:a', 'copy', '-y', wm_path
        ], capture_output=True, text=True)
        if wm_result.returncode != 0:
            print(f"[export] ffmpeg watermark step failed for job {job_id}: {wm_result.stderr}")
            _safe_remove(srt_path)
            _safe_remove(output_path)
            _safe_remove(wm_path)
            raise HTTPException(status_code=500, detail="Failed to generate video export")

        return FileResponse(wm_path, media_type="video/mp4", filename="cosmix_output.mp4")
    else:
        cmd += ['-y', output_path]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"[export] ffmpeg failed for job {job_id}: {result.stderr}")
            _safe_remove(srt_path)
            _safe_remove(output_path)
            raise HTTPException(status_code=500, detail="Failed to generate video export")
        background_tasks.add_task(_safe_remove, output_path)

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
