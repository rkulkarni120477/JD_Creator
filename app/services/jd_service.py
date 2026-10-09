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

        # First attempt with structured output (ApplicationExceptions propagate unchanged)
        parsed, usage = await self.bedrock_service.invoke_with_structured_output(messages, JDModelOutput)

        if usage:
            logger.info(f"Model invocation succeeded. Usage: {usage}")

        try:
            return self._validate_output(parsed)
        except ValidationError as e:
            # Schema validation failed; attempt one repair
            logger.warning(f"Model output validation failed: {e}")
            return await self._repair_model_output(messages, str(e), parsed)

    @staticmethod
    def _validate_output(parsed: object) -> JDModelOutput:
        """Coerce the model's structured output into JDModelOutput; raises ValidationError when it does not fit."""
        if isinstance(parsed, JDModelOutput):
            return parsed
        return JDModelOutput.model_validate(parsed)

    async def _repair_model_output(self, messages: list[dict], error: str, invalid_output: object) -> JDModelOutput:
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
{json.dumps(invalid_output, default=str) if invalid_output is not None else "(no structured output)"}

Please provide a valid response that matches the required schema.""",
            }
        )

        try:
            parsed, usage = await self.bedrock_service.invoke_with_structured_output(
                repair_messages, JDModelOutput
            )

            if usage:
                logger.info(f"Repair invocation succeeded. Usage: {usage}")

            return self._validate_output(parsed)

        except (ValidationError, ApplicationException) as e:
            logger.error(f"Repair failed: {e}")
            raise MalformedModelOutput("Failed to generate valid output after repair attempt", "")

    def _build_messages(self, request: GenerateRequest) -> list[dict]:
        """Build system and user messages for the model."""
        system_prompt = self._load_system_prompt()

        # Build the explicit fields section
        explicit_fields = self.build_explicit_fields(request.details)

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

    @classmethod
    def build_explicit_fields(cls, details) -> str:
        """Build the explicit fields section with precedence note."""
        lines = ["Explicit structured fields (authoritative; override conflicting natural-language requirements below):"]

        if details.job_title:
            lines.append(f"- Job Title: {details.job_title}")
        if details.technologies:
            lines.append(f"- Technologies / Tools: {', '.join(details.technologies)}")
        experience = cls._format_experience(details.experience_min, details.experience_max)
        if experience:
            lines.append(f"- Experience: {experience}")
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
        if details.client_context:
            lines.append(f"- Client / Project Context: {details.client_context}")
        if details.education:
            lines.append(f"- Education: {details.education}")
        if details.preferred_background:
            lines.append(f"- Preferred Sector Background: {', '.join(details.preferred_background)}")
        if details.collaborators:
            lines.append(f"- Works With: {', '.join(details.collaborators)}")
        if details.engagement_details:
            lines.append(f"- Engagement Details: {details.engagement_details}")
        if details.work_environment:
            lines.append(f"- Work Environment: {details.work_environment}")

        if len(lines) == 1:
            return "(None specified)"

        return "\n".join(lines)

    @staticmethod
    def _format_experience(minimum: int | None, maximum: int | None) -> str | None:
        """Render an experience range, treating 0 as a real value and an open upper bound as 'N+'."""
        if minimum is not None and maximum is not None:
            return f"{minimum} years" if minimum == maximum else f"{minimum}–{maximum} years"
        if minimum is not None:
            return f"{minimum}+ years"
        if maximum is not None:
            return f"up to {maximum} years"
        return None
