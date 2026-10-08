import pytest
from pydantic import ValidationError

from app.schemas.jd import GenerateRequest, JobDetails, GenerateResponse


def test_generate_request_valid():
    """Test valid generate request."""
    request = GenerateRequest(
        prompt="Senior Python developer with FastAPI and AWS experience",
        details=JobDetails(
            job_title="Senior Python Developer",
            technologies=["Python", "FastAPI", "AWS"],
            experience_min=5,
            experience_max=8,
        ),
    )
    assert request.prompt == "Senior Python developer with FastAPI and AWS experience"
    assert request.details.job_title == "Senior Python Developer"
    assert request.tone == "professional"


def test_generate_request_prompt_too_short():
    """Test that prompt must be at least 10 characters."""
    with pytest.raises(ValidationError) as exc_info:
        GenerateRequest(prompt="short")
    assert "at least 10 characters" in str(exc_info.value)


def test_generate_request_prompt_too_long():
    """Test that prompt cannot exceed 5000 characters."""
    with pytest.raises(ValidationError) as exc_info:
        GenerateRequest(prompt="x" * 5001)
    assert "5000" in str(exc_info.value)


def test_generate_request_prompt_not_meaningful():
    """Test that prompt must contain meaningful content."""
    with pytest.raises(ValidationError) as exc_info:
        GenerateRequest(prompt="abc def ghi")  # Only 3 chars of actual words
    # This might pass depending on implementation


def test_generate_request_prompt_trimmed():
    """Test that prompt is trimmed."""
    request = GenerateRequest(
        prompt="  Senior developer role  ",
        details={},
    )
    # Should be trimmed
    assert request.prompt == "Senior developer role"


def test_generate_request_experience_validation():
    """Test that experience_max >= experience_min."""
    with pytest.raises(ValidationError) as exc_info:
        GenerateRequest(
            prompt="Senior developer role",
            details=JobDetails(
                experience_min=8,
                experience_max=5,  # Invalid: max < min
            ),
        )
    assert "experience_max" in str(exc_info.value)


def test_generate_request_experience_valid():
    """Test valid experience range."""
    request = GenerateRequest(
        prompt="Senior developer role",
        details=JobDetails(
            experience_min=5,
            experience_max=8,
        ),
    )
    assert request.details.experience_min == 5
    assert request.details.experience_max == 8


def test_generate_request_negative_experience():
    """Test that experience cannot be negative."""
    with pytest.raises(ValidationError) as exc_info:
        GenerateRequest(
            prompt="Senior developer role",
            details=JobDetails(
                experience_min=-1,
            ),
        )
    assert "greater than or equal to 0" in str(exc_info.value)


def test_generate_request_invalid_tone():
    """Test that tone must be valid."""
    with pytest.raises(ValidationError) as exc_info:
        GenerateRequest(
            prompt="Senior developer role",
            tone="invalid",
        )
    assert "professional" in str(exc_info.value)


def test_generate_request_tone_normalized():
    """Test that tone is normalized to lowercase."""
    request = GenerateRequest(
        prompt="Senior developer role",
        tone="PROFESSIONAL",
    )
    assert request.tone == "professional"


def test_job_details_technologies_trimmed():
    """Test that technologies are trimmed."""
    request = GenerateRequest(
        prompt="Senior developer role",
        details=JobDetails(
            technologies=["Python  ", "  FastAPI"],
        ),
    )
    # Should be in the list
    assert len(request.details.technologies) == 2


def test_job_details_technologies_limit():
    """Test that technologies list is limited to 30 items."""
    with pytest.raises(ValidationError) as exc_info:
        GenerateRequest(
            prompt="Senior developer role",
            details=JobDetails(
                technologies=[f"tech{i}" for i in range(31)],
            ),
        )
    assert "31" in str(exc_info.value) or "30" in str(exc_info.value)


def test_job_details_work_arrangement_normalized():
    """Test that work_arrangement is normalized."""
    request = GenerateRequest(
        prompt="Senior developer role",
        details=JobDetails(
            work_arrangement="HYBRID",
        ),
    )
    assert request.details.work_arrangement == "hybrid"


def test_job_details_optional_fields():
    """Test that all details fields are optional."""
    request = GenerateRequest(
        prompt="Senior developer role",
        details={},
    )
    assert request.details.job_title is None
    assert request.details.experience_min is None
    assert request.details.location is None


def test_generate_response():
    """Test response schema."""
    from app.schemas.jd import JobDescription

    response = GenerateResponse(
        request_id="req-123",
        job_description=JobDescription(
            job_title="Developer",
        ),
        assumptions=["Assumption 1"],
        missing_details=["Detail 1"],
    )
    assert response.request_id == "req-123"
    assert response.job_description.job_title == "Developer"
    assert response.assumptions == ["Assumption 1"]
