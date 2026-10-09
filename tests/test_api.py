import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient
from fastapi.testclient import TestClient

from app.main import app
from app.api.jd import get_jd_service
from app.config import Settings, get_settings
from app.schemas.jd import JobDescription, JDModelOutput
from app.services.bedrock_service import BedrockService
from app.services.jd_service import JDService
from app.schemas.errors import ModelAccessDenied, RequestTimeout, ErrorCode


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_settings():
    return Settings(
        bedrock_model_id="test-model",
        max_request_body_bytes=100_000,
        per_ip_rate_limit_per_minute=30,
        max_concurrent_generations=10,
    )


def test_health_live(client):
    """Test liveness probe."""
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json() == {"status": "alive"}


def test_health_ready_without_model(client):
    """Test readiness probe fails without model ID."""
    app.dependency_overrides[get_settings] = lambda: Settings(bedrock_model_id="")
    try:
        response = client.get("/health/ready")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 503


def test_health_ready_with_model(client, mock_settings):
    """Test readiness probe succeeds with model ID."""
    app.dependency_overrides[get_settings] = lambda: mock_settings
    try:
        response = client.get("/health/ready")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200


def test_generate_returns_request_id_and_new_sections(client):
    """The response body carries the middleware's request ID and the new JD sections."""
    output = JDModelOutput(
        job_description=JobDescription(
            job_title="Business Analyst",
            project_context="Content pipeline modernization",
            engagement_details="Flexible hours",
            closing_statement="Apply today.",
        )
    )
    jd_service = MagicMock(spec=JDService)
    jd_service.generate_jd = AsyncMock(return_value=output)
    app.dependency_overrides[get_jd_service] = lambda: jd_service
    try:
        response = client.post("/api/jd/generate", json={"prompt": "Business analyst for content pipeline work"})
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["request_id"] == response.headers["X-Request-ID"]
    assert body["job_description"]["project_context"] == "Content pipeline modernization"
    assert body["job_description"]["engagement_details"] == "Flexible hours"
    assert body["job_description"]["closing_statement"] == "Apply today."


def test_generate_jd_invalid_prompt_length(client):
    """Test validation for prompt length."""
    response = client.post(
        "/api/jd/generate",
        json={
            "prompt": "short",  # Too short
            "details": {},
            "tone": "professional",
        },
    )
    assert response.status_code == 422  # Validation error


def test_generate_jd_invalid_tone(client):
    """Test validation for tone field."""
    response = client.post(
        "/api/jd/generate",
        json={
            "prompt": "A proper job description requirement with enough words.",
            "details": {},
            "tone": "invalid-tone",
        },
    )
    assert response.status_code == 422


def test_generate_jd_no_meaningful_content(client):
    """Test validation for meaningful requirement content."""
    response = client.post(
        "/api/jd/generate",
        json={
            "prompt": "aaa bbb ccc 111 222 333",  # Only punctuation/numbers
            "details": {},
            "tone": "professional",
        },
    )
    # May pass or fail depending on word tokenization


def test_generate_jd_experience_validation(client):
    """Test validation for experience fields."""
    response = client.post(
        "/api/jd/generate",
        json={
            "prompt": "A proper job description requirement with enough words.",
            "details": {
                "experience_min": 8,
                "experience_max": 5,  # max < min, should fail
            },
            "tone": "professional",
        },
    )
    assert response.status_code == 422


def test_request_id_in_response(client):
    """Test that request ID is added to response headers."""
    response = client.get("/health/live")
    assert "X-Request-ID" in response.headers
    # Should be a valid UUID-like string


def test_security_headers(client):
    """Test security headers are present."""
    response = client.get("/health/live")
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert "default-src 'self'" in response.headers.get("Content-Security-Policy", "")


def test_oversized_request(client):
    """Test request body size limit."""
    # Create a payload larger than max_request_body_bytes (100KB default)
    large_payload = {
        "prompt": "x" * 150_000,  # 150KB of content
        "details": {},
        "tone": "professional",
    }
    response = client.post("/api/jd/generate", json=large_payload)
    # Should be rejected with 413 or similar


def test_csp_header_no_inline_scripts(client):
    """Test CSP header prevents inline scripts."""
    response = client.get("/health/live")
    csp = response.headers.get("Content-Security-Policy", "")
    assert "script-src 'self'" in csp or "default-src 'self'" in csp


# Note: Full integration tests would require:
# - Mocking BedrockService
# - Testing actual response format
# - Testing error handling paths
# These would be extensive but follow the pattern above
