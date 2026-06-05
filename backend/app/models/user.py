from sqlalchemy import Column, String, Boolean, DateTime, Enum, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
import enum
from ..core.database import Base

class UserRole(str, enum.Enum):
    admin = "admin"
    pay_user = "pay_user"
    free_user = "free_user"   # admin-added, no watermark, no expiry
    trial = "trial"           # self-registered, 5 days, watermark
    expired = "expired"       # trial ended, must upgrade

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(Enum(UserRole), default=UserRole.trial, nullable=False)
    is_active = Column(Boolean, default=True)

    # Trial
    trial_start = Column(DateTime(timezone=True), server_default=func.now())
    trial_end = Column(DateTime(timezone=True), nullable=True)

    # Stripe
    stripe_customer_id = Column(String, nullable=True)
    stripe_subscription_id = Column(String, nullable=True)

    # Stats
    total_jobs = Column(String, default="0")
    total_paid = Column(String, default="0.00")   # USD
    extra_days = Column(String, default="0")       # admin-granted extra days

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
