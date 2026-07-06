from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = "Cosmix"
    DEBUG: bool = False
    
    DATABASE_URL: str = "postgresql://cosmix_user:cosmix_pass@localhost:5432/cosmix_db"
    REDIS_URL: str = "redis://localhost:6379/0"
    
    SECRET_KEY: str = "change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    
    ANTHROPIC_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    ASSEMBLYAI_API_KEY: str = ""
    GOOGLE_CLOUD_CREDENTIALS_JSON: str = ""  # service account JSON as string
    
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRO_PRICE_ID: str = ""
    STRIPE_TEAM_PRICE_ID: str = ""
    
    S3_BUCKET_NAME: str = "cosmix"
    S3_REGION: str = "auto"
    S3_ENDPOINT_URL: str = ""
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    
    TRIAL_DAYS: int = 7
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    class Config:
        env_file = ".env"

settings = Settings()
