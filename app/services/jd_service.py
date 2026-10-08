import asyncio
import json
import logging
from pathlib import Path

from pydantic import ValidationError

from app.config import Settings
from app.schemas.errors import ApplicationException, ErrorCode, MalformedModelOutput
from app.schemas.jd import GenerateRequest, JDModelOutput, JobDescription
from app.services.bedrock_service import BedrockService

logger = logging.getLogger(__name__)


class JDService:
    """Service for generating job descriptions."""

    def __init__(self, settings: Settings, bedrock_service: BedrockService):
        self.settings = settings
        self.bedrock_service = bedrock_service
        self._system_prompt = None

    def _load_system_prompt(self) -> str:
        """Load versioned system prompt."""
        if self._system_prompt is not None:
            return self._system_prompt

        prompt_path = Path(__file__).parent.parent / "prompts" / "jd_system.txt"
        with open(prompt_path) as f:
            self._system_prompt = f.read()

        return self._system_prompt

    async def generate_jd(self, request: GenerateRequest) -> JDModelOutput:
        """
        Generate a job description from requirements.

        Args:
            request: The generate request with prompt and optional details

        Returns:
            JDModelOutput with job_description, assumptions, and missing_details

        Raises:
            ApplicationException: On various errors (throttling, timeout, access denied, etc.)
        """
        # Build the model prompt
        messages = self._build_messages(request)

        # First attempt with structured output
        try:
            parsed, usage = await self.bedrock_service.invoke_with_structured_output(
                messages, JDModelOutput
            )

            if usage:
                logger.info(f"Model invocation succeeded. Usage: {usage}")

            return parsed

        except ApplicationException:
            # Re-raise application exceptions
            raise

        except ValidationError as e:
            # Schema validation failed; attempt one repair
            logger.warning(f"Model output validation failed: {e}")
            repaired = await self._repair_model_output(messages, str(e), parsed)
            return repaired

    async def _repair_model_output(self, messages: list[dict], error: str, invalid_output: str) -> JDModelOutput:
        """
        Attempt one repair of invalid model output.

        Args:
            messages: Original messages list
            error: Validation error message
            invalid_output: The invalid output that was returned

        Returns:
            Repaired JDModelOutput

        Raises:
            MalformedModelOutput: If repair fails
        """
        logger.info("Attempting to repair invalid model output")

        # Add repair request to conversation
        repair_messages = messages.copy()
        repair_messages.append(
            {
                "role": "user",
                "content": f"""The previous response failed validation:

Error: {error}

Invalid response was:
{invalid_output}

Please provide a valid response that matches the required schema.""",
            }
        )

        try:
            parsed, usage = await self.bedrock_service.invoke_with_structured_output(
                repair_messages, JDModelOutput
            )

            if usage:
                logger.info(f"Repair invocation succeeded. Usage: {usage}")

            return parsed

        except (ValidationError, ApplicationException) as e:
            logger.error(f"Repair failed: {e}")
            raise MalformedModelOutput("Failed to generate valid output after repair attempt", "")

    def _build_messages(self, request: GenerateRequest) -> list[dict]:
        """Build system and user messages for the model."""
        system_prompt = self._load_system_prompt()

        # Build the explicit fields section
        explicit_fields = self._build_explicit_fields(request.details)

        # Build the requirements section
        user_message = f"""Generate a professional job description based on these requirements:

{explicit_fields}

Natural language requirements:
{request.prompt}

Writing tone: {request.tone}

Respond with valid JSON matching the JobDescription schema."""

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

    def _build_explicit_fields(self, details) -> str:
        """Build the explicit fields section with precedence note."""
        lines = ["Explicit structured fields (authoritative; override conflicting text above):"]

        if details.job_title:
            lines.append(f"- Job Title: {details.job_title}")
        if details.technologies:
            lines.append(f"- Technologies: {', '.join(details.technologies)}")
        if details.experience_min is not None or details.experience_max is not None:
            min_exp = details.experience_min or "not specified"
            max_exp = details.experience_max or "not specified"
            lines.append(f"- Experience: {min_exp}–{max_exp} years")
        if details.location:
            lines.append(f"- Location: {details.location}")
        if details.work_arrangement:
            lines.append(f"- Work Arrangement: {details.work_arrangement}")
        if details.employment_type:
            lines.append(f"- Employment Type: {details.employment_type}")
        if details.industry:
            lines.append(f"- Industry: {details.industry}")
        if details.company_name:
            lines.append(f"- Company Name: {details.company_name}")
        if details.company_description:
            lines.append(f"- Company Description: {details.company_description}")

        if len(lines) == 1:
            return "(None specified)"

        return "\n".join(lines)
