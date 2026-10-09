import asyncio
import logging
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, NoCredentialsError, ProfileNotFound
from langchain_aws import ChatBedrockConverse
from langchain_core.exceptions import OutputParserException

from app.config import Settings
from app.schemas.errors import (
    ErrorCode,
    ApplicationException,
    ModelAccessDenied,
    RequestTimeout,
    ThrottledException,
)

logger = logging.getLogger(__name__)


class BedrockService:
    """Service for interacting with Amazon Bedrock."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.settings.validate_bedrock_model()
        self._model = None

    def _create_model(self) -> ChatBedrockConverse:
        """Create and cache the Bedrock model client."""
        if self._model is not None:
            return self._model

        # Create boto3 session with optional profile
        session = boto3.Session(
            profile_name=self.settings.aws_profile,
            region_name=self.settings.aws_region,
        )

        # botocore "standard" mode retries throttling/transient errors with exponential backoff and jitter
        botocore_config = Config(
            read_timeout=self.settings.bedrock_request_timeout_seconds,
            retries={"max_attempts": max(1, self.settings.bedrock_max_retries), "mode": "standard"},
        )

        # Create Bedrock client
        client = session.client("bedrock-runtime", config=botocore_config)

        # Create LangChain model
        self._model = ChatBedrockConverse(
            model_id=self.settings.bedrock_model_id,
            client=client,
            temperature=self.settings.bedrock_temperature,
            max_tokens=self.settings.bedrock_max_tokens,
        )

        return self._model

    async def invoke_with_structured_output(
        self, messages: list[dict[str, Any]], response_schema: type
    ) -> tuple[dict[str, Any], dict[str, Any] | None]:
        """
        Invoke Bedrock with structured output support.

        Args:
            messages: List of message dicts with 'role' and 'content'
            response_schema: Pydantic model for structured output

        Returns:
            Tuple of (response_dict, usage_metadata)

        Raises:
            ModelAccessDenied: Access denied to model
            RequestTimeout: Request timed out
            ThrottledException: Rate limited
            ApplicationException: Other errors
        """
        from langchain_core.messages import HumanMessage, SystemMessage

        try:
            model = self._create_model()

            # Apply structured output
            structured_model = model.with_structured_output(response_schema, include_raw=True)

            # Convert message dicts to LangChain message objects
            lc_messages = []
            for msg in messages:
                if msg["role"] == "system":
                    lc_messages.append(SystemMessage(content=msg["content"]))
                elif msg["role"] == "user":
                    lc_messages.append(HumanMessage(content=msg["content"]))

            # Run in executor to avoid blocking event loop
            loop = asyncio.get_running_loop()
            result = await asyncio.wait_for(
                loop.run_in_executor(None, structured_model.invoke, lc_messages),
                timeout=self.settings.overall_deadline_seconds,
            )

            # Extract structured data and usage
            structured_data = result.get("parsed") if isinstance(result, dict) else result.parsed
            if structured_data is None and isinstance(result, dict):
                # include_raw=True reports parse failures as parsed=None; hand back the raw tool arguments
                # so the caller can validate them and feed the specific errors into its repair attempt
                structured_data = self._raw_tool_arguments(result.get("raw"))
                logger.warning(f"Structured output parsing failed: {result.get('parsing_error')}")
            usage = self._extract_usage_metadata(result)

            return structured_data, usage

        except asyncio.TimeoutError:
            raise RequestTimeout("Bedrock request timed out", "")
        except (NoCredentialsError, ProfileNotFound) as e:
            raise ModelAccessDenied(f"AWS credentials are not configured for Bedrock: {e}", "")
        except ClientError as e:
            self._handle_client_error(e)
        except OutputParserException as e:
            raise ApplicationException(
                ErrorCode.MALFORMED_MODEL_OUTPUT,
                f"Failed to parse model output: {str(e)}",
                "",
            )

    @staticmethod
    def _raw_tool_arguments(raw: Any) -> dict[str, Any] | None:
        """Return the arguments of the first tool call on a raw AI message, if any."""
        tool_calls = getattr(raw, "tool_calls", None) or []
        if tool_calls and isinstance(tool_calls[0], dict):
            return tool_calls[0].get("args")
        return None

    def _extract_usage_metadata(self, response: Any) -> dict[str, Any] | None:
        """Defensively extract usage metadata from model response."""
        usage = {}

        # Handle dict response with 'raw' key
        if isinstance(response, dict):
            raw = response.get("raw")
            if raw and hasattr(raw, "usage_metadata"):
                metadata = raw.usage_metadata
                if isinstance(metadata, dict):
                    usage.update(metadata)
                else:
                    for key in ["input_tokens", "output_tokens"]:
                        val = getattr(metadata, key, None)
                        if val is not None:
                            usage[key] = val

        # Handle object with usage_metadata attribute
        if hasattr(response, "usage_metadata"):
            metadata = response.usage_metadata
            if isinstance(metadata, dict):
                usage.update(metadata)
            else:
                for key in ["input_tokens", "output_tokens"]:
                    val = getattr(metadata, key, None)
                    if val is not None:
                        usage[key] = val

        return usage if usage else None

    def _handle_client_error(self, error: ClientError) -> tuple[dict[str, Any], None]:
        """Map Bedrock errors to application exceptions."""
        error_code = error.response.get("Error", {}).get("Code", "Unknown")
        message = error.response.get("Error", {}).get("Message", "Unknown error")

        if error_code in ("AccessDeniedException", "UnauthorizedException"):
            raise ModelAccessDenied(f"Access denied to model: {message}", "")
        elif error_code in ("ValidationException", "ResourceNotFoundException"):
            raise ModelAccessDenied(
                f"Model '{self.settings.bedrock_model_id}' is not available: {message} "
                "Check JD_BEDROCK_MODEL_ID.",
                "",
            )
        elif error_code == "ThrottlingException":
            raise ThrottledException("Bedrock is throttling requests. Please retry shortly.", "")
        elif error_code == "ServiceUnavailableException":
            raise ThrottledException("Bedrock service is temporarily unavailable.", "")
        else:
            raise ApplicationException(
                ErrorCode.INTERNAL_ERROR,
                f"Bedrock error: {error_code}: {message}",
                "",
            )
