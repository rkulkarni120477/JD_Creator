from functools import lru_cache

from dotenv import load_dotenv
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="JD_",
        case_sensitive=False,
        extra="ignore",
    )

    # AWS configuration
    aws_region: str = "us-east-1"
    bedrock_model_id: str = ""  # Required; no default. Example: "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    aws_profile: str | None = None  # Optional; uses default credential chain if not set

    # Model parameters
    bedrock_temperature: float = 0.2
    bedrock_max_tokens: int = 4096
    bedrock_request_timeout_seconds: float = 60.0
    bedrock_max_retries: int = 3

    # Application tuning
    overall_deadline_seconds: float = 120.0
    max_concurrent_generations: int = 10
    max_request_body_bytes: int = 100_000
    per_ip_rate_limit_per_minute: int = 30

    # Logging
    log_level: str = "INFO"

    @field_validator("aws_profile", mode="before")
    @classmethod
    def blank_profile_is_none(cls, v):
        # An empty JD_AWS_PROFILE= in .env must mean "default credential chain", not a profile named ""
        if isinstance(v, str) and not v.strip():
            return None
        return v

    def validate_bedrock_model(self) -> None:
        """Ensure Bedrock model ID is configured."""
        if not self.bedrock_model_id.strip():
            raise ValueError(
                "BEDROCK_MODEL_ID environment variable is required. "
                "Set JD_BEDROCK_MODEL_ID or add bedrock_model_id to .env"
            )


@lru_cache
def get_settings() -> Settings:
    """
    Load settings once per process.

    .env is loaded into os.environ (without overriding real environment variables) so that
    non-prefixed AWS variables such as AWS_BEARER_TOKEN_BEDROCK reach boto3 as well.
    """
    load_dotenv(override=False)
    return Settings()
