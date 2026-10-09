import logging
from functools import lru_cache

from fastapi import APIRouter, Body, Depends, HTTPException, Request

from app.config import Settings, get_settings
from app.schemas.errors import ApplicationException, ErrorCode, ErrorResponse
from app.schemas.jd import GenerateRequest, GenerateResponse
from app.services.bedrock_service import BedrockService
from app.services.jd_service import JDService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/jd", tags=["jd"])


@lru_cache
def _shared_bedrock_service() -> BedrockService:
    # One service per process so the boto3 client and LangChain model are reused across requests
    return BedrockService(get_settings())


def get_bedrock_service() -> BedrockService:
    """Dependency to get Bedrock service instance."""
    return _shared_bedrock_service()


def get_jd_service(
    settings: Settings = Depends(get_settings),
    bedrock_service: BedrockService = Depends(get_bedrock_service),
) -> JDService:
    """Dependency to get JD service instance."""
    return JDService(settings, bedrock_service)


def get_request_id(request: Request) -> str:
    """Get the request ID assigned by the request-ID middleware."""
    return getattr(request.state, "request_id", "")


@router.post("/generate", response_model=GenerateResponse)
async def generate_jd(
    request: GenerateRequest = Body(...),
    jd_service: JDService = Depends(get_jd_service),
    request_id: str = Depends(get_request_id),
) -> GenerateResponse:
    """
    Generate a professional job description.

    Args:
        request: GenerateRequest with prompt and optional details
        jd_service: JD service instance
        request_id: Request ID from middleware

    Returns:
        GenerateResponse with generated JD, assumptions, and missing details

    Raises:
        HTTPException: On validation, throttling, timeout, or other errors
    """
    try:
        jd_output = await jd_service.generate_jd(request)

        return GenerateResponse(
            request_id=request_id,
            job_description=jd_output.job_description,
            assumptions=jd_output.assumptions,
            missing_details=jd_output.missing_details,
        )

    except ApplicationException as e:
        e.request_id = request_id
        status_code = _get_http_status_code(e.error_code)
        raise HTTPException(
            status_code=status_code,
            detail=ErrorResponse(
                request_id=request_id,
                error_code=e.error_code,
                message=e.message,
            ).model_dump(),
        )
    except Exception as e:
        logger.exception(f"Unexpected error in generate_jd: {e}")
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                request_id=request_id,
                error_code=ErrorCode.INTERNAL_ERROR,
                message="An unexpected error occurred",
            ).model_dump(),
        )


def _get_http_status_code(error_code: ErrorCode) -> int:
    """Map error code to HTTP status code."""
    mapping = {
        ErrorCode.VALIDATION_ERROR: 422,
        ErrorCode.THROTTLED: 429,
        ErrorCode.TIMEOUT: 504,
        ErrorCode.MODEL_ACCESS_DENIED: 503,
        ErrorCode.MALFORMED_MODEL_OUTPUT: 502,
        ErrorCode.SERVICE_BUSY: 503,
        ErrorCode.RATE_LIMITED: 429,
        ErrorCode.PAYLOAD_TOO_LARGE: 413,
        ErrorCode.INTERNAL_ERROR: 500,
    }
    return mapping.get(error_code, 500)
