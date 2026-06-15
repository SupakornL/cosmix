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
    # Allow Vercel preview deployments (e.g. cosmix-<hash>-bosscosmo-s-projects.vercel.app
    # or cosmix-git-<branch>-bosscosmo-s-projects.vercel.app) so feature branches can be
    # tested against this backend before merging to main.
    allow_origin_regex=r"^https://cosmix-[a-z0-9-]+-bosscosmo-s-projects\.vercel\.app$",
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
