from unittest.mock import AsyncMock, MagicMock

import pytest

from app.config import Settings
from app.schemas.errors import ThrottledException
from app.schemas.jd import GenerateRequest, JobDescription, JobDetails, QualityReview, ReviewIssue
from app.services.bedrock_service import BedrockService
from app.services.quality_service import QualityService

AVIATION_CLOSING = (
    "If you have a passion for ensuring high-quality aviation training and want to contribute your expertise, "
    "we encourage you to apply."
)


@pytest.fixture
def settings():
    return Settings(bedrock_model_id="test-model")


@pytest.fixture
def review_service(settings):
    service = MagicMock(spec=BedrockService)
    service.invoke_with_structured_output = AsyncMock(return_value=(QualityReview(), None))
    return service


@pytest.fixture
def quality_service(settings, review_service):
    return QualityService(settings, review_service)


def _ba_request(**details) -> GenerateRequest:
    return GenerateRequest(prompt="Business analyst for a content pipeline modernization", details=JobDetails(**details))


def _good_jd(**overrides) -> JobDescription:
    values = {
        "job_title": "Business Analyst",
        "location": "Remote",
        "employment_type": "Contract, Part-time",
        "experience": "5+ years",
        "responsibilities": ["Conduct stakeholder interviews"],
        "required_qualifications": ["5+ years of experience as a Business Analyst"],
        "closing_statement": "If you enjoy modernizing content operations, we encourage you to apply.",
    }
    values.update(overrides)
    return JobDescription(**values)


def _messages(warnings) -> list[str]:
    return [w.message for w in warnings]


def test_clean_jd_has_no_rule_warnings(quality_service):
    request = _ba_request(job_title="Business Analyst", experience_min=5, employment_type="contract, part-time")
    assert quality_service.rule_checks(request, _good_jd()) == []


def test_missing_header_fields_are_flagged(quality_service):
    """The original Business Analyst JD had no Location or Job Type line."""
    warnings = quality_service.rule_checks(_ba_request(), _good_jd(location=None, employment_type=None))
    assert {w.section for w in warnings} == {"location", "employment_type"}


def test_supplied_values_that_were_dropped_are_flagged(quality_service):
    request = _ba_request(
        job_title="Business Analyst", location="Remote", employment_type="contract, part-time", experience_min=5
    )
    jd = _good_jd(job_title="Senior Business Analyst", location=None, employment_type="Contract", experience="3+ years")

    messages = _messages(quality_service.rule_checks(request, jd))

    assert any("differs from the supplied title" in m for m in messages)
    assert any("supplied location 'Remote' is missing" in m for m in messages)
    assert any("'part-time' is not stated" in m for m in messages)
    assert any("minimum experience (5 years)" in m for m in messages)


def test_placeholders_and_empty_core_sections_are_errors(quality_service):
    jd = _good_jd(responsibilities=[], role_summary="Join [Company Name] as our analyst. Start date TBD.")
    warnings = quality_service.rule_checks(_ba_request(), jd)

    errors = [w for w in warnings if w.severity == "error"]
    assert {w.section for w in errors} == {"responsibilities", "role_summary"}
    assert any("[Company Name]" in w.message for w in errors)


def test_duplicate_bullets_and_repeated_tools_are_flagged(quality_service):
    jd = _good_jd(
        required_qualifications=["Advanced proficiency in Excel (mandatory)", "Strong communication skills"],
        preferred_qualifications=["Strong communication skills."],
        technical_skills=["Advanced Excel (mandatory)", "Tableau"],
    )
    messages = _messages(quality_service.rule_checks(_ba_request(), jd))

    assert any("in both required_qualifications and preferred_qualifications" in m for m in messages)
    assert any("'Advanced Excel (mandatory)' repeats a tool" in m for m in messages)
    assert not any("Tableau" in m for m in messages)


@pytest.mark.asyncio
async def test_review_reports_off_domain_text_and_drops_invented_excerpts(quality_service, review_service):
    review_service.invoke_with_structured_output.return_value = (
        {
            "issues": [
                {
                    "section": "closing_statement",
                    "excerpt": "high-quality aviation training",
                    "problem": "The closing refers to aviation training, unrelated to this content-pipeline role.",
                },
                {"section": "role_summary", "excerpt": "text that is not in the JD", "problem": "Invented."},
            ]
        },
        None,
    )

    warnings = await quality_service.check(_ba_request(), _good_jd(closing_statement=AVIATION_CLOSING))

    assert len(warnings) == 1
    assert warnings[0].severity == "error"
    assert warnings[0].section == "closing_statement"
    assert "aviation" in warnings[0].message
    sent = review_service.invoke_with_structured_output.call_args.args[0][1]["content"]
    assert "aviation training" in sent and "Business analyst for a content pipeline" in sent


@pytest.mark.asyncio
async def test_review_failure_does_not_fail_generation(quality_service, review_service):
    review_service.invoke_with_structured_output.side_effect = ThrottledException()

    warnings = await quality_service.check(_ba_request(), _good_jd())

    assert _messages(warnings) == ["The automated consistency review could not run for this JD."]


@pytest.mark.asyncio
async def test_review_can_be_disabled(review_service):
    service = QualityService(Settings(bedrock_model_id="test-model", quality_review_enabled=False), review_service)

    assert await service.check(_ba_request(), _good_jd()) == []
    review_service.invoke_with_structured_output.assert_not_called()
