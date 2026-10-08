from pydantic_settings import BaseSettings
from pydantic import ConfigDict


class Settings(BaseSettings):
    """Application configuration from environment variables."""

    model_config = ConfigDict(
        env_prefix="JD_",
        case_sensitive=False,
    )

    # AWS configuration
    aws_region: str = "us-east-1"
    bedrock_model_id: str = ""  # Required; no default. Example: "anthropic.claude-3-5-sonnet-20241022-v2:0"
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

    def validate_bedrock_model(self) -> None:
        """Ensure Bedrock model ID is configured."""
        if not self.bedrock_model_id.strip():
            raise ValueError(
                "BEDROCK_MODEL_ID environment variable is required. "
                "Set JD_BEDROCK_MODEL_ID or add bedrock_model_id to .env"
            )
