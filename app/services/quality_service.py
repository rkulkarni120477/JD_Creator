import json
import logging
import re
from pathlib import Path

from pydantic import ValidationError

from app.config import Settings
from app.schemas.errors import ApplicationException
from app.schemas.jd import GenerateRequest, JobDescription, QualityReview, QualityWarning
from app.services.bedrock_service import BedrockService
from app.services.jd_service import JDService

logger = logging.getLogger(__name__)

# Template leftovers: "[Company Name]", "{{client}}", "TBD", "XXX", "lorem ipsum"
_PLACEHOLDER = re.compile(r"\[[^\]\n]{2,40}\]|\{\{?[^}\n]{1,40}\}?\}|\b(?:TBD|TBC|XXX+|lorem ipsum)\b", re.IGNORECASE)

# List sections compared against each other for repeated bullets
_LIST_SECTIONS = (
    "responsibilities",
    "required_qualifications",
    "education_requirements",
    "preferred_qualifications",
    "technical_skills",
    "work_environment",
)
_QUALIFICATION_SECTIONS = ("required_qualifications", "education_requirements", "preferred_qualifications")

# Industry words that signal text left over from another posting, e.g. "aviation training" in a content-pipeline JD.
# Flagged only when the word appears nowhere in the supplied requirements. Words with common generic senses
# ("pilot programme", "data mining", "construction of dashboards") are deliberately left out.
_DOMAIN_TERMS = frozenset(
    {
        "aviation", "aerospace", "airline", "airlines", "aircraft",
        "healthcare", "hospital", "hospitals", "clinical", "nursing", "pharmaceutical", "pharma",
        "banking", "insurance", "automotive", "retail", "hospitality", "petroleum",
        "maritime", "military", "defense", "defence", "agriculture", "telecom", "telecommunications", "casino",
    }
)


def _normalize(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9 ]", " ", text.lower()).split())


def _tokens(text: str) -> set[str]:
    return set(_normalize(text).split())


class QualityService:
    """Post-generation checks: fast rule-based checks plus an optional model-based consistency review."""

    def __init__(self, settings: Settings, review_service: BedrockService | None):
        self.settings = settings
        self.review_service = review_service
        self._review_prompt: str | None = None

    async def check(self, request: GenerateRequest, jd: JobDescription) -> list[QualityWarning]:
        warnings = self.rule_checks(request, jd)
        if self.settings.quality_review_enabled and self.review_service is not None:
            warnings.extend(await self.review(request, jd))
        return warnings

    # ------------------------------------------------------------------
    # Rule-based checks
    # ------------------------------------------------------------------

    def rule_checks(self, request: GenerateRequest, jd: JobDescription) -> list[QualityWarning]:
        return [
            *self._check_core_sections(jd),
            *self._check_role_summary_format(jd),
            *self._check_engagement_format(jd),
            *self._check_header_fields(request, jd),
            *self._check_supplied_values(request, jd),
            *self._check_placeholders(jd),
            *self._check_duplicates(jd),
            *self._check_off_domain_terms(request, jd),
        ]

    @staticmethod
    def _check_core_sections(jd: JobDescription) -> list[QualityWarning]:
        warnings = []
        if not jd.responsibilities:
            warnings.append(QualityWarning(severity="error", section="responsibilities", message="No responsibilities were generated."))
        if not jd.required_qualifications:
            warnings.append(
                QualityWarning(severity="error", section="required_qualifications", message="No required qualifications were generated.")
            )
        if not jd.role_summary:
            warnings.append(
                QualityWarning(severity="warning", section="role_summary", message="No opening paragraph was generated.")
            )
        return warnings

    @staticmethod
    def _check_role_summary_format(jd: JobDescription) -> list[QualityWarning]:
        """Ensure role_summary emphasizes job title and focus with **bold** formatting."""
        warnings = []
        if jd.role_summary and "**" not in jd.role_summary:
            warnings.append(
                QualityWarning(
                    severity="warning",
                    section="role_summary",
                    message="The opening paragraph should emphasize the job title and main focus using **bold text** (e.g., **Data Analyst** and **market research**).",
                )
            )
        return warnings

    @staticmethod
    def _check_engagement_format(jd: JobDescription) -> list[QualityWarning]:
        """Ensure engagement_details is concise (one sentence as per system prompt)."""
        warnings = []
        if jd.engagement_details:
            # Count sentence-like breaks (periods, but not within abbreviations)
            sentence_count = len(re.findall(r"[.!?]+(?:\s|$)", jd.engagement_details))
            if sentence_count > 1:
                warnings.append(
                    QualityWarning(
                        severity="warning",
                        section="engagement_details",
                        message="Engagement details should be one complete sentence covering employment type(s), hours, duration and flexibility.",
                    )
                )
            # Word count warning (soft limit)
            word_count = len(jd.engagement_details.split())
            if word_count > 50:
                warnings.append(
                    QualityWarning(
                        severity="warning",
                        section="engagement_details",
                        message=f"Engagement details are lengthy ({word_count} words); consider making them more concise.",
                    )
                )
        return warnings

    @staticmethod
    def _check_header_fields(request: GenerateRequest, jd: JobDescription) -> list[QualityWarning]:
        warnings = []
        # A supplied-but-dropped location is reported by _check_supplied_values instead; a remote role needs no place
        is_remote = any("remote" in (v or "").lower() for v in (jd.work_arrangement, request.details.work_arrangement))
        if not jd.location and not request.details.location and not is_remote:
            warnings.append(
                QualityWarning(
                    severity="warning",
                    section="location",
                    message="No location is stated. Add a location (or 'Remote') so candidates know where the role is based.",
                )
            )
        if not jd.employment_type:
            warnings.append(
                QualityWarning(
                    severity="warning",
                    section="employment_type",
                    message="No job type is stated (for example Contract, Part-time or Full-time).",
                )
            )
        return warnings

    @staticmethod
    def _check_supplied_values(request: GenerateRequest, jd: JobDescription) -> list[QualityWarning]:
        details = request.details
        warnings = []

        if details.job_title and jd.job_title and _normalize(details.job_title) != _normalize(jd.job_title):
            warnings.append(
                QualityWarning(
                    severity="warning",
                    section="job_title",
                    message=f"The title '{jd.job_title}' differs from the supplied title '{details.job_title}'.",
                )
            )

        if details.location and not jd.location:
            warnings.append(
                QualityWarning(severity="warning", section="location", message=f"The supplied location '{details.location}' is missing.")
            )

        if details.employment_type:
            stated = re.sub(r"[^a-z]", "", (jd.employment_type or "").lower())
            for supplied in (t.strip() for t in details.employment_type.split(",")):
                if supplied and re.sub(r"[^a-z]", "", supplied) not in stated:
                    warnings.append(
                        QualityWarning(
                            severity="warning",
                            section="employment_type",
                            message=f"The supplied employment type '{supplied}' is not stated in the job type.",
                        )
                    )

        if details.company_name and jd.role_summary and _normalize(details.company_name) not in _normalize(jd.role_summary):
            warnings.append(
                QualityWarning(
                    severity="warning",
                    section="role_summary",
                    message=f"The opening paragraph does not name the hiring company '{details.company_name}'.",
                )
            )

        stated_years = set(re.findall(r"\d+", jd.experience or ""))
        for label, value in (("minimum", details.experience_min), ("maximum", details.experience_max)):
            if value is not None and str(value) not in stated_years:
                warnings.append(
                    QualityWarning(
                        severity="warning",
                        section="experience",
                        message=f"The supplied {label} experience ({value} years) is not reflected in '{jd.experience or 'no experience stated'}'.",
                    )
                )

        return warnings

    @staticmethod
    def _check_placeholders(jd: JobDescription) -> list[QualityWarning]:
        warnings = []
        for field, value in jd.model_dump().items():
            texts = value if isinstance(value, list) else [value]
            for text in texts:
                if isinstance(text, str) and (match := _PLACEHOLDER.search(text)):
                    warnings.append(
                        QualityWarning(severity="error", section=field, message=f"Unfilled placeholder '{match.group(0)}'.")
                    )
        return warnings

    @staticmethod
    def _check_duplicates(jd: JobDescription) -> list[QualityWarning]:
        warnings = []
        seen: dict[str, str] = {}
        for field in _LIST_SECTIONS:
            for item in getattr(jd, field):
                key = _normalize(item)
                if not key:
                    continue
                if key in seen:
                    where = "twice in" if seen[key] == field else f"in both {seen[key]} and"
                    warnings.append(QualityWarning(severity="warning", section=field, message=f"'{item}' appears {where} {field}."))
                else:
                    seen[key] = field

        # Short tool names that the qualifications already cover, e.g. "Advanced Excel (mandatory)"
        qualification_tokens = [_tokens(q) for f in _QUALIFICATION_SECTIONS for q in getattr(jd, f)]
        for skill in jd.technical_skills:
            core = _tokens(re.sub(r"\(.*?\)", "", skill))
            if core and len(core) <= 4 and any(core <= tokens for tokens in qualification_tokens):
                warnings.append(
                    QualityWarning(
                        severity="warning",
                        section="technical_skills",
                        message=f"'{skill}' repeats a tool already covered in the qualifications.",
                    )
                )
        return warnings

    @staticmethod
    def _check_off_domain_terms(request: GenerateRequest, jd: JobDescription) -> list[QualityWarning]:
        supplied = _tokens(" ".join([request.prompt, JDService.build_explicit_fields(request.details)]))
        warnings = []
        for field, value in jd.model_dump().items():
            texts = value if isinstance(value, list) else [value]
            found = set()
            for text in texts:
                if isinstance(text, str):
                    found |= (_tokens(text) & _DOMAIN_TERMS) - supplied
            for term in sorted(found):
                warnings.append(
                    QualityWarning(
                        severity="warning",
                        section=field,
                        message=f"Mentions '{term}', which does not appear in the supplied requirements; it may be left over from another job description.",
                    )
                )
        return warnings

    # ------------------------------------------------------------------
    # Model-based consistency review
    # ------------------------------------------------------------------

    def _load_review_prompt(self) -> str:
        if self._review_prompt is None:
            prompt_path = Path(__file__).parent.parent / "prompts" / "jd_review.txt"
            self._review_prompt = prompt_path.read_text(encoding="utf-8")
        return self._review_prompt

    async def review(self, request: GenerateRequest, jd: JobDescription) -> list[QualityWarning]:
        jd_json = json.dumps(jd.model_dump(), ensure_ascii=False, indent=2)
        messages = [
            {"role": "system", "content": self._load_review_prompt()},
            {
                "role": "user",
                "content": f"""Supplied requirements:

{JDService.build_explicit_fields(request.details)}

Natural language requirements:
{request.prompt}

Job description to check (JSON):
{jd_json}""",
            },
        ]

        try:
            parsed, _ = await self.review_service.invoke_with_structured_output(messages, QualityReview)
            review = parsed if isinstance(parsed, QualityReview) else QualityReview.model_validate(parsed)
        except (ApplicationException, ValidationError) as e:
            logger.warning(f"Consistency review failed: {e}")
            return [QualityWarning(severity="warning", message="The automated consistency review could not run for this JD.")]

        # Drop issues whose quoted excerpt is not actually in the JD, so the reviewer cannot invent problems
        haystack = _normalize(jd_json)
        return [
            QualityWarning(severity="error", section=issue.section, message=f"{issue.problem} (\"{issue.excerpt}\")")
            for issue in review.issues
            if _normalize(issue.excerpt) and _normalize(issue.excerpt) in haystack
        ]
