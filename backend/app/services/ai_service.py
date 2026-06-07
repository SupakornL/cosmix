import anthropic
from groq import AsyncGroq
from ..core.config import settings
import json
import re

claude = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
groq_client = AsyncGroq(api_key=settings.GROQ_API_KEY)
CLAUDE_MODEL = "claude-sonnet-4-5"

# ─── Thai+English Tokenizer ───────────────────────────────────
def tokenize_segment(text: str) -> list[str]:
    """Tokenize Thai+English mixed text using PyThaiNLP."""
    try:
        from pythainlp.tokenize import word_tokenize
        # Split into Thai and non-Thai chunks first
        chunks = re.split(r'([\u0E00-\u0E7F]+)', text)
        tokens = []
        for chunk in chunks:
            chunk = chunk.strip()
            if not chunk:
                continue
            if re.search(r'[\u0E00-\u0E7F]', chunk):
                # Thai: use PyThaiNLP newmm engine
                words = word_tokenize(chunk, engine='longest', keep_whitespace=False)
                tokens.extend([w for w in words if w.strip()])
            else:
                # English/numbers: split by space
                parts = chunk.split()
                tokens.extend([p for p in parts if p.strip()])
        return tokens if tokens else text.split()
    except Exception:
        return text.split()

def build_word_timestamps(segments: list) -> list:
    """
    Build word timestamps from segments using PyThaiNLP tokenization.
    Distributes timing proportionally based on character count.
    """
    result = []
    for seg in segments:
        tokens = tokenize_segment(seg["text"])
        if not tokens:
            continue
        
        seg_dur = seg["end"] - seg["start"]
        if seg_dur <= 0:
            continue

        # Weight by character length for more natural timing
        lengths = [max(1, len(t)) for t in tokens]
        total_len = sum(lengths)
        
        pos = seg["start"]
        for token, length in zip(tokens, lengths):
            dur = seg_dur * (length / total_len)
            result.append({
                "word": token,
                "start": round(pos, 3),
                "end": round(pos + dur, 3),
            })
            pos += dur
    
    return result

# ─── Transcription ────────────────────────────────────────────
async def transcribe_audio(audio_path: str, language: str = "auto") -> dict:
    with open(audio_path, "rb") as f:
        kwargs = {
            "file": (audio_path, f, "audio/mp3"),
            "model": "whisper-large-v3",
            "response_format": "verbose_json",
            "timestamp_granularities": ["segment", "word"],
        }
        if language != "auto":
            kwargs["language"] = language
        result = await groq_client.audio.transcriptions.create(**kwargs)

    segments = []
    if hasattr(result, "segments") and result.segments:
        segments = [
            {
                "id": i,
                "start": s.get("start", 0),
                "end": s.get("end", 0),
                "text": s.get("text", "").strip(),
            }
            for i, s in enumerate(result.segments)
        ]

    # Use Groq word timestamps if available, fallback to PyThaiNLP
    groq_words = []
    if hasattr(result, "words") and result.words:
        for w in result.words:
            if hasattr(w, "word"):
                groq_words.append({
                    "word": w.word.strip(),
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                })
    words = groq_words if groq_words else build_word_timestamps(segments)

    return {
        "text": result.text,
        "language": getattr(result, "language", language),
        "segments": segments,
        "words": words,
    }
def segments_to_srt(segments: list) -> str:
    def fmt(s):
        h, m, sec, ms = int(s//3600), int((s%3600)//60), int(s%60), int((s-int(s))*1000)
        return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"
    lines = []
    for i, seg in enumerate(segments, 1):
        lines += [str(i), f"{fmt(seg['start'])} --> {fmt(seg['end'])}", seg["text"], ""]
    return "\n".join(lines)

async def suggest_cuts(transcript: str, duration: float) -> dict:
    msg = await claude.messages.create(
        model=CLAUDE_MODEL, max_tokens=1000,
        messages=[{"role": "user", "content": f"You are a video editor. Analyze this transcript and suggest cuts.\nDuration: {duration:.1f}s\nTranscript: {transcript}\n\nReturn ONLY valid JSON:\n{{\"summary\":\"...\",\"suggested_cuts\":[{{\"start\":0.0,\"end\":5.0,\"reason\":\"...\"}}],\"highlight_segments\":[{{\"start\":0.0,\"end\":10.0,\"reason\":\"...\"}}],\"estimated_final_duration\":0.0}}"}]
    )
    text = msg.content[0].text.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    return json.loads(text)

async def auto_cut_analysis(transcript: str, duration: float) -> dict:
    msg = await claude.messages.create(
        model=CLAUDE_MODEL, max_tokens=1000,
        messages=[{"role": "user", "content": f"Identify segments to REMOVE (silence, filler, false starts).\nDuration: {duration:.1f}s\nTranscript: {transcript}\n\nReturn ONLY valid JSON:\n{{\"cuts\":[{{\"start\":0.0,\"end\":2.5,\"type\":\"silence\",\"reason\":\"...\"}}],\"estimated_time_saved\":0.0}}"}]
    )
    text = msg.content[0].text.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    return json.loads(text)

async def chat_edit_command(user_message: str, transcript: str, history: list) -> str:
    msg = await claude.messages.create(
        model=CLAUDE_MODEL, max_tokens=500,
        system=f"You are Cosmix AI video editor. Transcript:\n{transcript}\n\nFor edits return JSON like {{\"action\":\"cut\",\"start\":0.0,\"end\":5.0}}. For questions reply in same language as user.",
        messages=[*[{"role": m["role"], "content": m["content"]} for m in history], {"role": "user", "content": user_message}]
    )
    return msg.content[0].text
