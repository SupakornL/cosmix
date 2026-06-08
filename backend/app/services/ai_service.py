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
    """Tokenize Thai+English mixed text using attacut + pythainlp fallback."""

    def tokenize_thai_chunk(chunk: str) -> list[str]:
        # Try attacut first (most accurate, learning-based)
        try:
            from attacut import tokenize as attacut_tokenize
            tokens = attacut_tokenize(chunk)
            tokens = [t for t in tokens if t.strip()]
            if tokens and not (len(tokens) == 1 and len(chunk) > 4):
                return tokens
        except Exception:
            pass

        # Try pythainlp newmm
        try:
            from pythainlp.tokenize import word_tokenize
            tokens = word_tokenize(chunk, engine='newmm', keep_whitespace=False)
            tokens = [t for t in tokens if t.strip()]
            if tokens and not (len(tokens) == 1 and len(chunk) > 4):
                return tokens
        except Exception:
            pass

        # Try TCC (Thai Character Cluster) — inseparable units
        try:
            from pythainlp.tokenize import tcc
            tokens = [t for t in tcc.segment(chunk) if t.strip()]
            if tokens:
                return tokens
        except Exception:
            pass

        # Absolute fallback: regex TCC-like split
        tcc_pattern = r'[เแโใไ][ก-ฮ][็-๎]?[ะาิีึื-ุูัo]?[็-๎]?[ก-ฮ]?|[ก-ฮ][็-๎]?[ะาิีึื-ุูัo]?[็-๎]?[ก-ฮ]?[็-๎]?|[ก-ฮ]'
        tokens = re.findall(tcc_pattern, chunk)
        return tokens if tokens else list(chunk)

    try:
        chunks = re.split(r'([\u0E00-\u0E7F]+)', text)
        tokens = []
        for chunk in chunks:
            chunk = chunk.strip()
            if not chunk:
                continue
            if re.search(r'[\u0E00-\u0E7F]', chunk):
                tokens.extend(tokenize_thai_chunk(chunk))
            else:
                tokens.extend([p for p in chunk.split() if p.strip()])
        return tokens if tokens else [text]
    except Exception:
        return [text]

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
    import assemblyai as aai
    import asyncio

    aai.settings.api_key = settings.ASSEMBLYAI_API_KEY

    # Language code mapping
    lang_map = {
        "th": "th", "en": "en", "ja": "ja", "zh": "zh",
        "ko": "ko", "fr": "fr", "de": "de", "es": "es",
        "pt": "pt", "ar": "ar", "hi": "hi", "ru": "ru",
        "vi": "vi", "id": "id",
    }

    config_kwargs = {}
    if language != "auto" and language in lang_map:
        config_kwargs["language_code"] = lang_map[language]
    else:
        config_kwargs["language_detection"] = True

    config = aai.TranscriptionConfig(**config_kwargs)
    transcriber = aai.Transcriber(config=config)

    # AssemblyAI SDK is sync — run in executor
    loop = asyncio.get_event_loop()
    transcript = await loop.run_in_executor(
        None, lambda: transcriber.transcribe(audio_path)
    )

    if transcript.status == aai.TranscriptStatus.error:
        raise Exception(f"AssemblyAI error: {transcript.error}")

    # Build segments from sentences (natural breaks)
    segments = []
    if transcript.get_sentences():
        for i, sentence in enumerate(transcript.get_sentences()):
            segments.append({
                "id": i,
                "start": sentence.start / 1000.0,
                "end": sentence.end / 1000.0,
                "text": sentence.text.strip(),
            })
    else:
        # Fallback: use full transcript as one segment
        segments = [{
            "id": 0,
            "start": 0,
            "end": transcript.audio_duration or 0,
            "text": transcript.text or "",
        }]

    # Build word timestamps — AssemblyAI gives phrase-level for Thai
    # so we split each phrase into words using PyThaiNLP, distributing time proportionally
    raw_words = []
    if transcript.words:
        for w in transcript.words:
            if w.text and w.text.strip():
                raw_words.append({
                    "text": w.text.strip(),
                    "start": round(w.start / 1000.0, 3),
                    "end": round(w.end / 1000.0, 3),
                })

    words = []
    if raw_words:
        for phrase in raw_words:
            tokens = tokenize_segment(phrase["text"])
            if not tokens:
                continue
            dur = phrase["end"] - phrase["start"]
            if dur <= 0:
                words.append({"word": phrase["text"], "start": phrase["start"], "end": phrase["end"]})
                continue
            lengths = [max(1, len(t)) for t in tokens]
            total = sum(lengths)
            pos = phrase["start"]
            for token, length in zip(tokens, lengths):
                d = dur * (length / total)
                words.append({
                    "word": token,
                    "start": round(pos, 3),
                    "end": round(pos + d, 3),
                })
                pos += d
    else:
        words = build_word_timestamps(segments)

    detected_lang = getattr(transcript, "language_code", language) or language

    return {
        "text": transcript.text or "",
        "language": detected_lang,
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
