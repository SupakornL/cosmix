import boto3
import os
from botocore.config import Config
from ..core.config import settings

def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.S3_REGION,
        config=Config(signature_version="s3v4"),
    )

def upload_file(local_path: str, key: str) -> str:
    """Upload file to R2 and return the key."""
    s3 = get_s3_client()
    s3.upload_file(local_path, settings.S3_BUCKET_NAME, key)
    return key

def download_file(key: str, local_path: str):
    """Download file from R2 to local path."""
    s3 = get_s3_client()
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    s3.download_file(settings.S3_BUCKET_NAME, key, local_path)

def delete_file(key: str):
    """Delete file from R2."""
    try:
        s3 = get_s3_client()
        s3.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    except Exception:
        pass

def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    """Generate presigned URL for direct access."""
    s3 = get_s3_client()
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET_NAME, "Key": key},
        ExpiresIn=expires_in,
    )
