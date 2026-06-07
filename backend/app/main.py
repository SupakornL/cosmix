from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings
from .routers import auth, jobs, admin, payments

app = FastAPI(
    title="Cosmix API",
    description="AI-powered video editor backend",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(payments.router, prefix="/api")

@app.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}
