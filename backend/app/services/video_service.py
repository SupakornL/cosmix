import subprocess
import os
import json

FFMPEG = "ffmpeg"
FFPROBE = "ffprobe"
WATERMARK_TEXT = "COSMIX TRIAL — cosmixapp.com"

def extract_audio(video_path: str, output_path: str) -> str:
    result = subprocess.run([
        FFMPEG, '-i', video_path, '-vn',
        '-acodec', 'mp3', '-ac', '1', '-ar', '16000',
        output_path, '-y'
    ], capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"ffmpeg extract_audio failed: {result.stderr[-300:]}")
    return output_path

def get_video_duration(video_path: str) -> float:
    result = subprocess.run([
        FFPROBE, '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', video_path
    ], capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"ffprobe failed: {result.stderr}")
    return float(result.stdout.strip())

def get_video_info(video_path: str) -> dict:
    result = subprocess.run([
        FFPROBE, '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,r_frame_rate',
        '-of', 'json', video_path
    ], capture_output=True, text=True)
    info = json.loads(result.stdout)
    stream = info.get('streams', [{}])[0]
    duration = get_video_duration(video_path)
    return {
        'duration': duration,
        'width': stream.get('width', 1920),
        'height': stream.get('height', 1080),
    }

def apply_auto_cuts(video_path: str, cuts: list, output_path: str) -> str:
    """
    Apply auto cuts — keep segments NOT in cuts list.
    Uses ffmpeg concat to join kept segments.
    """
    duration = get_video_duration(video_path)
    
    # Sort cuts by start time
    sorted_cuts = sorted(cuts, key=lambda x: x.get('start', 0))
    
    # Build KEEP segments (inverse of cuts)
    keep = []
    pos = 0.0
    for cut in sorted_cuts:
        start = float(cut.get('start', 0))
        end = float(cut.get('end', 0))
        if start > pos + 0.1:  # keep gap before this cut
            keep.append((pos, start))
        pos = max(pos, end)
    if pos < duration - 0.1:
        keep.append((pos, duration))
    
    if not keep:
        # Nothing to keep — return original
        import shutil
        shutil.copy(video_path, output_path)
        return output_path
    
    if len(keep) == 1 and keep[0][0] < 0.1 and keep[0][1] >= duration - 0.1:
        # No cuts needed
        import shutil
        shutil.copy(video_path, output_path)
        return output_path
    
    # Write segments to a temp concat file
    import tempfile
    segments = []
    temp_files = []
    
    for i, (start, end) in enumerate(keep):
        seg_path = f"/tmp/cosmix_seg_{i}_{os.getpid()}.mp4"
        temp_files.append(seg_path)
        result = subprocess.run([
            FFMPEG, '-ss', str(start), '-to', str(end),
            '-i', video_path,
            '-c', 'copy', '-avoid_negative_ts', 'make_zero',
            seg_path, '-y'
        ], capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"ffmpeg segment failed: {result.stderr[-200:]}")
        segments.append(seg_path)
    
    # Write concat list
    concat_file = f"/tmp/cosmix_concat_{os.getpid()}.txt"
    with open(concat_file, 'w') as f:
        for seg in segments:
            f.write(f"file '{seg}'\n")
    
    # Concat segments
    result = subprocess.run([
        FFMPEG, '-f', 'concat', '-safe', '0',
        '-i', concat_file,
        '-c', 'copy', output_path, '-y'
    ], capture_output=True, text=True)
    
    # Cleanup temp files
    for f in temp_files + [concat_file]:
        try:
            os.remove(f)
        except:
            pass
    
    if result.returncode != 0:
        raise Exception(f"ffmpeg concat failed: {result.stderr[-200:]}")
    
    return output_path

def add_watermark(video_path: str, output_path: str) -> str:
    text = WATERMARK_TEXT.replace("'", "\\'").replace(":", "\\:")
    result = subprocess.run([
        FFMPEG, '-i', video_path,
        '-vf', f"drawtext=text='{text}':fontcolor=white@0.6:fontsize=20:x=(w-text_w)/2:y=h-th-20:box=1:boxcolor=black@0.4:boxborderw=6",
        '-codec:a', 'copy', '-y', output_path
    ], capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"ffmpeg watermark failed: {result.stderr[-300:]}")
    return output_path

def burn_subtitles(video_path: str, srt_path: str, output_path: str) -> str:
    result = subprocess.run([
        FFMPEG, '-i', video_path,
        '-vf', f"subtitles={srt_path}",
        '-codec:a', 'copy', '-y', output_path
    ], capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"ffmpeg subtitles failed: {result.stderr[-300:]}")
    return output_path
