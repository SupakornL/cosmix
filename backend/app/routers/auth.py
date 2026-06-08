from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr
from typing import Optional
from ..core.database import get_db
from ..core.security import verify_password, get_password_hash, create_access_token
from ..core.config import settings
from ..models.user import User, UserRole

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    trial_end: Optional[datetime] = None

@router.post("/register", response_model=TokenResponse)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    trial_end = datetime.utcnow() + timedelta(days=settings.TRIAL_DAYS)
    user = User(
        email=data.email,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        role=UserRole.trial,
        trial_end=trial_end,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, token_type="bearer", role=user.role, trial_end=trial_end)

@router.post("/login", response_model=TokenResponse)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    
    # Auto-expire trial
    if user.role == UserRole.trial and user.trial_end and datetime.utcnow().replace(tzinfo=user.trial_end.tzinfo) > user.trial_end:
        user.role = UserRole.expired
        db.commit()
    
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token, token_type="bearer", role=user.role, trial_end=user.trial_end)

@router.get("/me")
def get_me(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    from ..core.security import decode_token
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(user.id),
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "trial_end": user.trial_end,
    }
    user.hashed_password = get_password_hash("admin1234")
    db.commit()
    return {"ok": True, "email": user.email}
