from fastapi import APIRouter, Response, Depends
from fastapi.responses import JSONResponse

from app.config import Settings

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def health_live() -> dict:
    """Liveness probe: confirms the service is running."""
    return {"status": "alive"}


@router.get("/ready", response_model=None)
async def health_ready(settings: Settings = Depends()):
    """Readiness probe: confirms required configuration is available."""
    try:
        settings.validate_bedrock_model()
        return JSONResponse({"status": "ready"}, status_code=200)
    except ValueError as e:
        return Response(
            content=str(e),
            status_code=503,
            media_type="text/plain",
        )
