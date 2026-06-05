# Cosmix — AI Video Editor

Space-themed AI-powered video editing web app.

## Tech Stack
- **Backend**: FastAPI + Python 3.11 + Celery + Redis
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **AI**: OpenAI Whisper (transcription) + GPT-4o (editing intelligence)
- **Video**: ffmpeg-python
- **DB**: PostgreSQL
- **Payments**: Stripe

## Quick Start

### Prerequisites
```bash
brew install ffmpeg postgresql redis
```

### Backend
```bash
cd backend
cp .env.example .env        # fill in your API keys
pip install -r requirements.txt

# Start PostgreSQL and Redis first, then:
make run                    # FastAPI on :8000
make worker                 # Celery worker (separate terminal)
```

### Frontend
```bash
cd frontend
npm install
npm run dev                 # React on :5173
```

API docs: http://localhost:8000/docs

## User Roles
| Role       | Access                              |
|------------|-------------------------------------|
| `trial`    | All features, 7 days, watermark on  |
| `pay_user` | All features, no watermark          |
| `admin`    | All features, no watermark, free    |

## AI Modes
| Mode           | What it does                                      |
|----------------|---------------------------------------------------|
| `auto_cut`     | Removes silence and filler automatically          |
| `subtitle_only`| Transcribes and generates SRT in chosen language  |
| `suggest_edits`| GPT-4o reviews transcript and suggests cuts       |
| `chat_edit`    | Natural language edit commands via GPT-4o         |
