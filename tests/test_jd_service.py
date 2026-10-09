import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pydantic import ValidationError

from app.config import Settings
from app.schemas.jd import GenerateRequest, JobDetails, JDModelOutput, JobDescription
from app.schemas.errors import MalformedModelOutput, ApplicationException, ErrorCode
from app.services.jd_service import JDService
from app.services.bedrock_service import BedrockService


@pytest.fixture
def settings():
    return Settings(bedrock_model_id="test-model")


@pytest.fixture
def bedrock_service(settings):
    service = MagicMock(spec=BedrockService)
    service.settings = settings
    return service


@pytest.fixture
def jd_service(settings, bedrock_service):
    return JDService(settings, bedrock_service)


@pytest.mark.asyncio
async def test_generate_jd_success(jd_service, bedrock_service):
    """Test successful JD generation."""
    # Mock response
    expected_output = JDModelOutput(
        job_description=JobDescription(
            job_title="Senior Developer",
            role_summary="Build production systems",
            responsibilities=["Write code"],
            required_qualifications=["5 years experience"],
            technical_skills=["Python"],
        ),
        assumptions=["Assumed full-time role"],
        missing_details=["Salary not specified"],
    )

    bedrock_service.invoke_with_structured_output = AsyncMock(
        return_value=(expected_output.model_dump(), {"input_tokens": 100, "output_tokens": 200})
    )

    # Create request
    request = GenerateRequest(
        prompt="Senior Python developer for AI work",
        details=JobDetails(job_title="Senior Python Developer"),
    )

    # Generate
    result = await jd_service.generate_jd(request)

    assert result.job_description.job_title == "Senior Developer"
    assert result.assumptions == ["Assumed full-time role"]
    assert result.missing_details == ["Salary not specified"]
    bedrock_service.invoke_with_structured_output.assert_called_once()


@pytest.mark.asyncio
async def test_generate_jd_with_repair(jd_service, bedrock_service):
    """Test JD generation with output repair."""
    valid_output = JDModelOutput(
        job_description=JobDescription(job_title="Developer"),
    )

    # First call raises validation error, second succeeds
    bedrock_service.invoke_with_structured_output = AsyncMock(
        side_effect=[
            ({"invalid": "data"}, None),  # Invalid
            (valid_output.model_dump(), None),  # Repaired
        ]
    )

    request = GenerateRequest(prompt="Senior Python developer for AI work")

    result = await jd_service.generate_jd(request)

    assert result.job_description.job_title == "Developer"
    assert bedrock_service.invoke_with_structured_output.call_count == 2


@pytest.mark.asyncio
async def test_generate_jd_repair_fails(jd_service, bedrock_service):
    """Test JD generation when repair fails."""
    bedrock_service.invoke_with_structured_output = AsyncMock(
        side_effect=[({"invalid": "data"}, None), ({"still": "invalid"}, None)]
    )

    request = GenerateRequest(prompt="Senior Python developer for AI work")

    with pytest.raises(MalformedModelOutput):
        await jd_service.generate_jd(request)


@pytest.mark.asyncio
async def test_generate_jd_repairs_unparsed_output(jd_service, bedrock_service):
    """A parse failure (parsed=None) triggers a repair instead of returning None."""
    valid_output = JDModelOutput(job_description=JobDescription(job_title="Developer"))
    bedrock_service.invoke_with_structured_output = AsyncMock(
        side_effect=[(None, None), (valid_output, None)]
    )

    result = await jd_service.generate_jd(GenerateRequest(prompt="Senior Python developer for AI work"))

    assert result.job_description.job_title == "Developer"
    repair_prompt = bedrock_service.invoke_with_structured_output.call_args_list[1].args[0][-1]["content"]
    assert "(no structured output)" in repair_prompt


@pytest.mark.parametrize(
    ("minimum", "maximum", "expected"),
    [(5, None, "5+ years"), (2, 4, "2–4 years"), (0, 2, "0–2 years"), (3, 3, "3 years"), (None, 4, "up to 4 years")],
)
def test_experience_formatting(minimum, maximum, expected):
    assert JDService._format_experience(minimum, maximum) == expected


def test_new_structured_fields_reach_prompt(jd_service):
    """Client context, education, background, collaborators, engagement and environment are sent to the model."""
    request = GenerateRequest(
        prompt="Business analyst for a content pipeline modernization",
        details=JobDetails(
            employment_type="Contract, Part-time",
            client_context="Client is modernizing its content pipeline",
            education="Bachelor's in Statistics",
            preferred_background=["EdTech", "publishing"],
            collaborators=["Content Strategists", "Engineering"],
            engagement_details="Flexible hours based on project needs",
            work_environment="Asynchronous and remote",
        ),
    )

    user_message = jd_service._build_messages(request)[1]["content"]

    assert "- Employment Type: contract, part-time" in user_message
    assert "- Client / Project Context: Client is modernizing its content pipeline" in user_message
    assert "- Education: Bachelor's in Statistics" in user_message
    assert "- Preferred Sector Background: EdTech, publishing" in user_message
    assert "- Works With: Content Strategists, Engineering" in user_message
    assert "- Engagement Details: Flexible hours based on project needs" in user_message
    assert "- Work Environment: Asynchronous and remote" in user_message


@pytest.mark.asyncio
async def test_explicit_field_precedence(jd_service):
    """Test that explicit fields are marked as overriding in the prompt."""
    request = GenerateRequest(
        prompt="A developer role",
        details=JobDetails(
            job_title="Senior Developer",
            technologies=["Python", "FastAPI"],
        ),
    )

    messages = jd_service._build_messages(request)

    # Check that explicit fields section contains the structured data
    user_message = messages[1]["content"]
    assert "Senior Developer" in user_message
    assert "Python" in user_message
    assert "override" in user_message.lower()


@pytest.mark.asyncio
async def test_system_prompt_loaded(jd_service):
    """Test that system prompt is loaded correctly."""
    system_prompt = jd_service._load_system_prompt()

    assert "version:" in system_prompt
    assert "recruitment specialist" in system_prompt.lower()
    assert "assumptions" in system_prompt.lower()
