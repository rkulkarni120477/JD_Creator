from typing import Literal

from pydantic import BaseModel, Field, field_validator, ConfigDict
import re


class JobDetails(BaseModel):
    """Optional structured details to supplement the natural-language requirement."""

    job_title: str | None = Field(None, max_length=200)
    technologies: list[str] = Field(default_factory=list, max_length=30)
    experience_min: int | None = Field(None, ge=0)
    experience_max: int | None = Field(None, ge=0)
    location: str | None = Field(None, max_length=200)
    work_arrangement: str | None = Field(None)  # remote, hybrid, onsite
    employment_type: str | None = Field(None, max_length=100)  # one or more of: full-time, part-time, contract
    industry: str | None = Field(None, max_length=200)
    company_name: str | None = Field(None, max_length=200)
    company_description: str | None = Field(None, max_length=1000)
    client_context: str | None = Field(None, max_length=1000)  # client, project or initiative the role supports
    education: str | None = Field(None, max_length=500)
    preferred_background: list[str] = Field(default_factory=list, max_length=15)  # sectors/domains, e.g. EdTech
    collaborators: list[str] = Field(default_factory=list, max_length=15)  # teams/roles worked with
    engagement_details: str | None = Field(None, max_length=500)  # hours, duration, flexibility
    work_environment: str | None = Field(None, max_length=500)

    @field_validator("technologies", "preferred_background", "collaborators", mode="before")
    @classmethod
    def validate_short_lists(cls, v):
        if not isinstance(v, list):
            return v
        return [t.strip()[:60] for t in v if t and t.strip()]  # Trim each entry to 60 chars

    @field_validator("experience_max")
    @classmethod
    def experience_max_gte_min(cls, v, info):
        if v is not None and info.data.get("experience_min") is not None:
            if v < info.data["experience_min"]:
                raise ValueError("experience_max must be >= experience_min")
        return v

    @field_validator("work_arrangement", "employment_type", mode="before")
    @classmethod
    def normalize_enums(cls, v):
        if v:
            return v.lower()
        return v


class GenerateRequest(BaseModel):
    """Request to generate a job description."""

    prompt: str = Field(..., min_length=10, max_length=5000)
    details: JobDetails = Field(default_factory=JobDetails)
    tone: str = Field("professional")  # professional, concise, detailed

    @field_validator("prompt")
    @classmethod
    def validate_prompt_has_requirement(cls, v):
        # Trim and check for meaningful content
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Prompt cannot be empty")
        # Extract alphabetic words (at least 3)
        words = re.findall(r"\b[a-zA-Z]+\b", trimmed)
        if len(words) < 3:
            raise ValueError("Prompt must contain at least 3 words describing the role")
        return trimmed

    @field_validator("tone")
    @classmethod
    def validate_tone(cls, v):
        valid = {"professional", "concise", "detailed"}
        if v.lower() not in valid:
            raise ValueError(f"Tone must be one of {valid}")
        return v.lower()


class JobDescription(BaseModel):
    """The generated job description."""

    job_title: str | None = None
    role_summary: str | None = None
    company_overview: str | None = Field(
        None,
        description=(
            "Only facts from the supplied company description; null when none was supplied. "
            "Never describe what the company does from its name alone."
        ),
    )
    project_context: str | None = Field(
        None, description="The client, project or initiative this role supports, only if supplied by the user."
    )
    location: str | None = None
    work_arrangement: str | None = None
    employment_type: str | None = Field(
        None, description="One or more employment types, e.g. 'Contract or Part-time'."
    )
    experience: str | None = Field(None, description="e.g. '5+ years' or '2–4 years'; null when unspecified.")
    responsibilities: list[str] = Field(default_factory=list)
    required_qualifications: list[str] = Field(default_factory=list)
    education_requirements: list[str] = Field(
        default_factory=list,
        description="Degree or field-of-study requirements, only as supplied by the user; mark preferred ones as such.",
    )
    preferred_qualifications: list[str] = Field(default_factory=list)
    technical_skills: list[str] = Field(
        default_factory=list,
        description=(
            "A distinct tools/technology list. Must not repeat any tool already named in required_qualifications "
            "or preferred_qualifications; leave empty when every tool is already covered there or the role is "
            "not tool-centric."
        ),
    )
    engagement_details: str | None = Field(
        None, description="Contract terms such as hours, duration, schedule flexibility, only as supplied."
    )
    work_environment: list[str] = Field(
        default_factory=list, description="How and where the work happens, e.g. async/remote collaboration, check-ins."
    )
    compensation_and_benefits: str | None = None
    application_instructions: str | None = None
    closing_statement: str | None = Field(
        None,
        description=(
            "A short closing invitation to apply that refers only to this role and its domain. "
            "Do not include links or contact details that were not supplied."
        ),
    )


class JDModelOutput(BaseModel):
    """Internal model output combining JD, assumptions, and missing details."""

    job_description: JobDescription
    assumptions: list[str] = Field(default_factory=list)
    missing_details: list[str] = Field(default_factory=list)


class QualityWarning(BaseModel):
    """A problem found in a generated JD by the post-generation checks."""

    severity: Literal["error", "warning"]
    section: str | None = None  # JobDescription field name, when the problem is tied to one
    message: str


class ReviewIssue(BaseModel):
    """One problem reported by the model-based consistency review."""

    section: str = Field(description="The JobDescription field containing the problem, e.g. closing_statement.")
    excerpt: str = Field(description="The exact offending text, quoted from the job description.")
    problem: str = Field(description="One sentence explaining what is inconsistent and with what.")


class QualityReview(BaseModel):
    """Internal model output of the consistency review."""

    issues: list[ReviewIssue] = Field(default_factory=list)


class GenerateResponse(BaseModel):
    """Response from the generate endpoint."""

    request_id: str
    job_description: JobDescription
    assumptions: list[str] = Field(default_factory=list)
    missing_details: list[str] = Field(default_factory=list)
    quality_warnings: list[QualityWarning] = Field(default_factory=list)
