from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = "Cosmix"
    DEBUG: bool = False
    
    # Database
    DATABASE_URL: str = "postgresql://cosmix_user:cosmix_pass@localhost:5432/cosmix_db"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Security
    SECRET_KEY: str = "change-this-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24h
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    # OpenAI
    ANTHROPIC_API_KEY: str = "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"
    GROQ_API_KEY: str = "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"
    
    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRO_PRICE_ID: str = ""
    STRIPE_TEAM_PRICE_ID: str = ""
    
    # Storage (S3 compatible)
    S3_BUCKET_NAME: str = "cosmix-videos"
    S3_REGION: str = "ap-southeast-1"
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    
    # Trial
    TRIAL_DAYS: int = 7
    
    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    @validator("ALLOWED_ORIGINS", pre=True)
    def parse_allowed_origins(cls, v):
        if isinstance(v, str):
            return [i.strip() for i in v.split(",")]
        return v

    class Config:
        env_file = ".env"

settings = Settings()
