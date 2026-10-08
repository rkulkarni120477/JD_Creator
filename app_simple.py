"""
Simplified JD Creator app that works around Pydantic/FastAPI compatibility issues.
This demonstrates all core functionality without the versioning conflict.
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse
import json
import uuid
from pathlib import Path

app = FastAPI(
    title="JD Creator",
    description="Turn hiring requirements into professional job descriptions"
)

@app.get("/")
async def serve_index():
    """Serve index.html"""
    index_path = Path(__file__).parent / "static" / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {"message": "JD Creator API is running"}

# Serve static files
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")


@app.get("/health/live")
async def health_live():
    """Liveness probe"""
    return {"status": "alive"}


@app.get("/health/ready")
async def health_ready():
    """Readiness probe"""
    # In production, would check Bedrock model access
    return JSONResponse({"status": "ready"}, status_code=200)


@app.post("/api/jd/generate")
async def generate_jd(request: dict):
    """
    Generate a job description.

    Request format:
    {
        "prompt": "Senior Python Developer with...",
        "details": {...optional fields...},
        "tone": "professional"
    }
    """
    try:
        # Validate required fields
        if not isinstance(request, dict):
            raise HTTPException(status_code=400, detail="Invalid request format")

        prompt = request.get("prompt", "").strip()
        if len(prompt) < 10:
            raise HTTPException(
                status_code=422,
                detail={"error_code": "VALIDATION_ERROR", "message": "Prompt must be at least 10 characters"}
            )

        details = request.get("details", {})
        tone = request.get("tone", "professional").lower()

        if tone not in ["professional", "concise", "detailed"]:
            raise HTTPException(
                status_code=422,
                detail={"error_code": "VALIDATION_ERROR", "message": "Invalid tone"}
            )

        request_id = str(uuid.uuid4())

        # For demonstration, return a sample JD
        # In production, this would call Bedrock via LangChain
        sample_jd = {
            "request_id": request_id,
            "job_description": {
                "job_title": details.get("job_title", "Senior Developer"),
                "role_summary": f"Based on your requirements: {prompt[:100]}...",
                "location": details.get("location", "Remote"),
                "work_arrangement": details.get("work_arrangement", "flexible"),
                "employment_type": details.get("employment_type", "full-time"),
                "experience": f"{details.get('experience_min', 5)}–{details.get('experience_max', 8)} years",
                "responsibilities": [
                    "Design and implement scalable solutions",
                    "Collaborate with cross-functional teams",
                    "Mentor junior developers",
                    "Participate in code reviews"
                ],
                "required_qualifications": [
                    f"{details.get('experience_min', 5)}+ years of professional experience",
                    "Strong problem-solving skills",
                    "Experience with modern development practices"
                ],
                "preferred_qualifications": [
                    "Experience with cloud platforms",
                    "Open source contributions",
                    "Leadership experience"
                ],
                "technical_skills": details.get("technologies", ["Python", "FastAPI", "AWS"]),
            },
            "assumptions": [
                "Assumed full-time permanent role",
                "Assumed role involves technical leadership",
                "Assumed modern tech stack"
            ],
            "missing_details": [
                "Salary range not specified",
                "Team size not specified",
                "Reporting structure not specified"
            ]
        }

        return sample_jd

    except HTTPException:
        raise
    except Exception as e:
        request_id = str(uuid.uuid4())
        raise HTTPException(
            status_code=500,
            detail={
                "request_id": request_id,
                "error_code": "INTERNAL_ERROR",
                "message": str(e)
            }
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
