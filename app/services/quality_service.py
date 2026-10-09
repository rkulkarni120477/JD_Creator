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
            *self._check_header_fields(request, jd),
            *self._check_supplied_values(request, jd),
            *self._check_placeholders(jd),
            *self._check_duplicates(jd),
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
        return warnings

    @staticmethod
    def _check_header_fields(request: GenerateRequest, jd: JobDescription) -> list[QualityWarning]:
        warnings = []
        # A supplied-but-dropped location is reported by _check_supplied_values instead
        if not jd.location and not request.details.location:
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
