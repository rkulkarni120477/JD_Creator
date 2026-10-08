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
    employment_type: str | None = Field(None)  # full-time, part-time, contract
    industry: str | None = Field(None, max_length=200)
    company_name: str | None = Field(None, max_length=200)
    company_description: str | None = Field(None, max_length=1000)

    @field_validator("technologies", mode="before")
    @classmethod
    def validate_technologies(cls, v):
        if not isinstance(v, list):
            return v
        return [t[:60] for t in v if t]  # Trim each tech to 60 chars

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
    company_overview: str | None = None
    location: str | None = None
    work_arrangement: str | None = None
    employment_type: str | None = None
    experience: str | None = None
    responsibilities: list[str] = Field(default_factory=list)
    required_qualifications: list[str] = Field(default_factory=list)
    preferred_qualifications: list[str] = Field(default_factory=list)
    technical_skills: list[str] = Field(default_factory=list)
    compensation_and_benefits: str | None = None
    application_instructions: str | None = None


class JDModelOutput(BaseModel):
    """Internal model output combining JD, assumptions, and missing details."""

    job_description: JobDescription
    assumptions: list[str] = Field(default_factory=list)
    missing_details: list[str] = Field(default_factory=list)


class GenerateResponse(BaseModel):
    """Response from the generate endpoint."""

    request_id: str
    job_description: JobDescription
    assumptions: list[str] = Field(default_factory=list)
    missing_details: list[str] = Field(default_factory=list)
