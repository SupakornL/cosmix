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

def _merge_close_words(raw_words: list, max_gap: float = 0.02, max_merged_chars: int = 6) -> list:
    """Merge consecutive words with gap ≤ max_gap seconds, only when merged result is short.
    Fixes Google STT splitting short compound words like โปรตีน→โปร+ต+ีน (0ms gap)
    without over-merging continuous Thai speech into one giant token."""
    if not raw_words:
        return raw_words
    merged = [dict(raw_words[0])]
    for w in raw_words[1:]:
        gap = w["start"] - merged[-1]["end"]
        candidate = merged[-1]["word"] + w["word"]
        if gap <= max_gap and len(candidate) <= max_merged_chars:
            merged[-1]["word"] = candidate
            merged[-1]["end"] = max(merged[-1]["end"], w["end"])
        else:
            merged.append(dict(w))
    return merged


def _group_words_into_segments(raw_words: list, words_per_segment: int = 4) -> list:
    segments = []
    for i in range(0, len(raw_words), words_per_segment):
        chunk = raw_words[i:i + words_per_segment]
        text = "".join(w["word"] for w in chunk)
        segments.append({
            "id": i // words_per_segment,
            "start": chunk[0]["start"],
            "end": chunk[-1]["end"],
            "text": text,
        })
    return segments


async def _transcribe_groq(audio_path: str, language: str) -> dict:
    """Transcribe using Groq Whisper with real word-level timestamps."""
    lang_arg = None if language == "auto" else language

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    # Thai prompt — primes Whisper to output correct Thai script and spelling.
    # Using common Thai words/phrases reduces hallucination and transliteration errors.
    thai_prompt = (
        "ต่อไปนี้เป็นเนื้อหาภาษาไทย กรุณาถอดความเป็นภาษาไทยที่ถูกต้องและชัดเจน "
        "ใช้ตัวอักษรไทยเท่านั้น ไม่ใช้การทับศัพท์หรืออักษรโรมัน "
        "เช่น สวัสดีครับ ขอบคุณครับ ใช่ครับ ไม่ครับ อะไรนะครับ"
    )

    kwargs = dict(
        file=(audio_path, audio_bytes, "audio/mpeg"),
        model="whisper-large-v3",
        response_format="verbose_json",
        timestamp_granularities=["word"],
        temperature=0.0,
        prompt=thai_prompt if (not lang_arg or lang_arg == "th") else "",
    )
    if lang_arg:
        kwargs["language"] = lang_arg

    response = await groq_client.audio.transcriptions.create(**kwargs)

    groq_words = getattr(response, "words", None) or []
    raw_words = []
    for w in groq_words:
        word_text = getattr(w, "word", "").strip()
        if not word_text:
            continue
        start = float(getattr(w, "start", 0))
        end = float(getattr(w, "end", start))
        # Groq gives real word timestamps — split Thai words within each token
        tokens = tokenize_segment(word_text)
        if len(tokens) <= 1:
            raw_words.append({"word": word_text, "start": round(start, 3), "end": round(end, 3)})
        else:
            dur = end - start
            lengths = [max(1, len(t)) for t in tokens]
            total = sum(lengths)
            pos = start
            for token, length in zip(tokens, lengths):
                d = dur * (length / total)
                raw_words.append({"word": token, "start": round(pos, 3), "end": round(pos + d, 3)})
                pos += d

    full_text = getattr(response, "text", "") or ""
    detected_lang = getattr(response, "language", language) or language

    if raw_words:
        # Got real word-level timestamps — group into display segments
        segments = _group_words_into_segments(raw_words)
        words = raw_words
    else:
        # Groq didn't return word timestamps — try segment-level (sentence timestamps)
        groq_segments = getattr(response, "segments", None) or []
        if groq_segments:
            segments = []
            for i, s in enumerate(groq_segments):
                seg_start = float(getattr(s, "start", 0))
                seg_end = float(getattr(s, "end", seg_start))
                seg_text = (getattr(s, "text", "") or "").strip()
                if seg_text and seg_end > seg_start:
                    segments.append({"id": i, "start": round(seg_start, 3), "end": round(seg_end, 3), "text": seg_text})
            if not segments:
                raise ValueError("Groq returned no usable segments — falling back to AssemblyAI")
            words = build_word_timestamps(segments)
        else:
            raise ValueError("Groq returned no segments or words — falling back to AssemblyAI")

    return {"text": full_text, "language": detected_lang, "segments": segments, "words": words}


async def _transcribe_assemblyai(audio_path: str, language: str) -> dict:
    """Transcribe using AssemblyAI (fallback). Thai timestamps are phrase-level."""
    import assemblyai as aai
    import asyncio

    aai.settings.api_key = settings.ASSEMBLYAI_API_KEY

    lang_map = {
        "th": "th", "en": "en", "ja": "ja", "zh": "zh",
        "ko": "ko", "fr": "fr", "de": "de", "es": "es",
        "pt": "pt", "ar": "ar", "hi": "hi", "ru": "ru",
        "vi": "vi", "id": "id",
    }

    config_kwargs = {"speech_models": ["universal-3-pro", "universal-2"]}
    if language != "auto" and language in lang_map:
        config_kwargs["language_code"] = lang_map[language]
    else:
        config_kwargs["language_detection"] = True

    config = aai.TranscriptionConfig(**config_kwargs)
    transcriber = aai.Transcriber(config=config)

    loop = asyncio.get_event_loop()
    transcript = await loop.run_in_executor(None, lambda: transcriber.transcribe(audio_path))

    if transcript.status == aai.TranscriptStatus.error:
        raise Exception(f"AssemblyAI error: {transcript.error}")

    raw_words = []
    if transcript.words:
        for w in transcript.words:
            if w.text and w.text.strip():
                tokens = tokenize_segment(w.text.strip())
                dur = (w.end - w.start) / 1000.0
                if dur <= 0:
                    continue
                lengths = [max(1, len(t)) for t in tokens]
                total = sum(lengths)
                pos = w.start / 1000.0
                for token, length in zip(tokens, lengths):
                    d = dur * (length / total)
                    raw_words.append({"word": token, "start": round(pos, 3), "end": round(pos + d, 3)})
                    pos += d

    segments = []
    if raw_words:
        segments = _group_words_into_segments(raw_words)
    elif transcript.get_sentences():
        for i, sentence in enumerate(transcript.get_sentences()):
            segments.append({"id": i, "start": sentence.start / 1000.0, "end": sentence.end / 1000.0, "text": sentence.text.strip()})
    else:
        segments = [{"id": 0, "start": 0, "end": transcript.audio_duration or 0, "text": transcript.text or ""}]

    words = raw_words if raw_words else build_word_timestamps(segments)
    detected_lang = getattr(transcript, "language_code", language) or language

    return {"text": transcript.text or "", "language": detected_lang, "segments": segments, "words": words}


async def _transcribe_google(audio_path: str, language: str) -> dict:
    """Transcribe using Google Cloud Speech-to-Text — best Thai accuracy."""
    import asyncio, json
    from google.cloud import speech
    from google.oauth2 import service_account

    creds_json = settings.GOOGLE_CLOUD_CREDENTIALS_JSON
    if not creds_json:
        raise ValueError("GOOGLE_CLOUD_CREDENTIALS_JSON not set")

    creds_info = json.loads(creds_json)
    credentials = service_account.Credentials.from_service_account_info(
        creds_info, scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    client = speech.SpeechClient(credentials=credentials)

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    lang_code = "th-TH"
    if language not in ("auto", "th"):
        lang_map = {"en": "en-US", "ja": "ja-JP", "zh": "zh-TW", "ko": "ko-KR",
                    "fr": "fr-FR", "de": "de-DE", "es": "es-ES", "vi": "vi-VN", "id": "id-ID"}
        lang_code = lang_map.get(language, "th-TH")

    audio = speech.RecognitionAudio(content=audio_bytes)
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.MP3,
        sample_rate_hertz=16000,
        language_code=lang_code,
        enable_word_time_offsets=True,
        enable_automatic_punctuation=True,
        model="latest_long",
    )

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None, lambda: client.recognize(config=config, audio=audio)
    )

    if not response.results:
        raise ValueError("Google STT returned no results")

    raw_words = []
    full_text_parts = []
    for result in response.results:
        alt = result.alternatives[0]
        full_text_parts.append(alt.transcript)
        for w in alt.words:
            word_text = w.word.strip()
            # Strip SentencePiece boundary marker ▁ (U+2581) and skip blank/filler tokens
            word_text = word_text.replace('▁', '').strip()
            if not word_text:
                continue
            start = w.start_time.total_seconds()
            end = w.end_time.total_seconds()
            # Cap word duration: Google STT sometimes returns end_time = next speech onset
            # (across long silences), making one word appear to last 10-15 seconds.
            # Estimate realistic max: 100ms/char, minimum 300ms.
            max_dur = max(0.3, len(word_text) * 0.1)
            end = min(end, start + max_dur)
            raw_words.append({"word": word_text, "start": round(start, 3), "end": round(end, 3)})

    full_text = " ".join(full_text_parts)
    if not raw_words:
        raise ValueError("Google STT returned no word timestamps")

    raw_words = _merge_close_words(raw_words)
    segments = _group_words_into_segments(raw_words)
    return {"text": full_text, "language": lang_code, "segments": segments, "words": raw_words}


async def transcribe_audio(audio_path: str, language: str = "auto") -> dict:
    """Transcribe audio. Priority: Google STT → Groq Whisper → AssemblyAI."""
    if settings.GOOGLE_CLOUD_CREDENTIALS_JSON:
        try:
            return await _transcribe_google(audio_path, language)
        except Exception as e:
            print(f"[transcribe] Google STT failed ({e}), falling back to Groq")

    try:
        return await _transcribe_groq(audio_path, language)
    except Exception as groq_err:
        print(f"[transcribe] Groq failed ({groq_err}), falling back to AssemblyAI")
        return await _transcribe_assemblyai(audio_path, language)
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
