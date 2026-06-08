from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta
from fastapi.security import OAuth2PasswordBearer
from ..core.database import get_db
from ..core.security import decode_token, get_password_hash
from ..models.user import User, UserRole
from ..models.job import Job, JobStatus

router = APIRouter(prefix="/admin", tags=["admin"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def require_admin(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user

# ─── Overview ───────────────────────────────────────────────

@router.get("/overview")
def get_overview(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    trial_users = db.query(User).filter(User.role == UserRole.trial).count()
    pay_users = db.query(User).filter(User.role == UserRole.pay_user).count()
    free_users = db.query(User).filter(User.role == UserRole.free_user).count()
    expired_users = db.query(User).filter(User.role == UserRole.expired).count()
    total_jobs = db.query(Job).count()
    processing_jobs = db.query(Job).filter(Job.status == JobStatus.processing).count()
    failed_jobs = db.query(Job).filter(Job.status == JobStatus.failed).count()

    return {
        "users": {
            "total": total_users,
            "trial": trial_users,
            "pay": pay_users,
            "free": free_users,
            "expired": expired_users,
        },
        "jobs": {
            "total": total_jobs,
            "processing": processing_jobs,
            "failed": failed_jobs,
        },
    }

# ─── User Management ────────────────────────────────────────

@router.get("/users")
def list_users(
    page: int = 1,
    limit: int = 20,
    role: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    total = q.count()
    users = q.order_by(User.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "page": page,
        "users": [
            {
                "id": str(u.id),
                "email": u.email,
                "full_name": u.full_name,
                "role": u.role,
                "is_active": u.is_active,
                "trial_end": u.trial_end,
                "extra_days": u.extra_days,
                "total_jobs": u.total_jobs,
                "total_paid": u.total_paid,
                "created_at": u.created_at,
                "days_left": max(0, (u.trial_end - datetime.now(u.trial_end.tzinfo)).days) if u.trial_end and u.role == UserRole.trial else None,
            }
            for u in users
        ]
    }

class AddFreeUserRequest(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    password: str

@router.post("/users/add-free")
def add_free_user(
    data: AddFreeUserRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Admin adds a free_user — no trial expiry, no watermark"""
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    user = User(
        email=data.email,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        role=UserRole.free_user,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": str(user.id), "email": user.email, "role": user.role}

class UpdateUserRequest(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    extra_days: Optional[int] = None

@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    data: UpdateUserRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.role:
        user.role = data.role
        if data.role == UserRole.pay_user:
            user.trial_end = None  # remove trial limit

    if data.is_active is not None:
        user.is_active = data.is_active

    if data.extra_days is not None:
        # Extend trial_end by extra_days
        base = user.trial_end or datetime.utcnow()
        user.trial_end = base + timedelta(days=data.extra_days)
        user.extra_days = str(int(user.extra_days or 0) + data.extra_days)

    db.commit()
    return {"success": True, "role": user.role, "trial_end": user.trial_end}

@router.delete("/users/{user_id}/ban")
def ban_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
    return {"success": True}

# ─── Job Monitoring ──────────────────────────────────────────

@router.get("/jobs")
def list_jobs(
    page: int = 1,
    limit: int = 20,
    status: Optional[str] = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    q = db.query(Job)
    if status:
        q = q.filter(Job.status == status)
    total = q.count()
    jobs = q.order_by(Job.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "total": total,
        "jobs": [
            {
                "id": str(j.id),
                "user_id": str(j.user_id),
                "filename": j.original_filename,
                "ai_mode": j.ai_mode,
                "status": j.status,
                "progress": j.progress,
                "has_watermark": j.has_watermark,
                "created_at": j.created_at,
                "error": j.error_message,
            }
            for j in jobs
        ]
    }
