from sqlalchemy import Column, String, DateTime, Enum, Text, Integer, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
import enum
from ..core.database import Base

class JobStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    failed = "failed"

class AIMode(str, enum.Enum):
    auto_cut = "auto_cut"
    subtitle_only = "subtitle_only"
    suggest_edits = "suggest_edits"
    chat_edit = "chat_edit"

class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    # Input
    original_filename = Column(String, nullable=False)
    input_s3_key = Column(String, nullable=False)
    
    # Config
    ai_mode = Column(Enum(AIMode), nullable=False)
    subtitle_language = Column(String, nullable=True)  # e.g. "th", "en", "auto"
    
    # Status
    status = Column(Enum(JobStatus), default=JobStatus.pending)
    progress = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    
    # Output
    output_s3_key = Column(String, nullable=True)
    subtitle_srt = Column(Text, nullable=True)
    ai_suggestions = Column(JSON, nullable=True)
    has_watermark = Column(String, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
