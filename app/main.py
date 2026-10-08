import asyncio
import json
import logging
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.config import Settings
from app.api import health, jd
from app.schemas.errors import ErrorCode, ErrorResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format=json.dumps(
        {"timestamp": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "message": "%(message)s"}
    ),
)
logger = logging.getLogger(__name__)

# Global state for rate limiting and concurrency
settings = Settings()
generation_semaphore = asyncio.Semaphore(settings.max_concurrent_generations)
ip_request_times = defaultdict(list)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle context manager."""
    logger.info(f"JD Creator starting. Region: {settings.aws_region}, Model: {settings.bedrock_model_id}")
    yield
    logger.info("JD Creator shutting down")


app = FastAPI(
    title="JD Creator",
    description="Turn your hiring requirements into a professional job description",
    version="0.1.0",
    lifespan=lifespan,
)


# ============================================================================
# Middleware
# ============================================================================


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add request ID to all requests."""
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id

    # Add to dependency resolution
    async def _get_request_id():
        return request_id

    app.dependency_overrides[str] = _get_request_id

    start_time = time.time()
    response = await call_next(request)

    # Add request ID to response headers
    response.headers["X-Request-ID"] = request_id

    # Log request
    duration_ms = (time.time() - start_time) * 1000
    log_entry = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status": response.status_code,
        "duration_ms": f"{duration_ms:.1f}",
        "client_ip": request.client.host if request.client else "unknown",
    }
    logger.info(json.dumps(log_entry))

    return response


@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    """Enforce maximum request body size."""
    if request.method in ("POST", "PUT", "PATCH"):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > settings.max_request_body_bytes:
            return Response(
                content=json.dumps(
                    ErrorResponse(
                        request_id=getattr(request.state, "request_id", ""),
                        error_code=ErrorCode.PAYLOAD_TOO_LARGE,
                        message=f"Request body exceeds {settings.max_request_body_bytes} bytes",
                    ).model_dump()
                ),
                status_code=413,
                media_type="application/json",
            )

    return await call_next(request)


@app.middleware("http")
async def enforce_concurrency_limit(request: Request, call_next):
    """Enforce max concurrent generations."""
    if request.url.path == "/api/jd/generate" and request.method == "POST":
        if generation_semaphore._value <= 0:
            return Response(
                content=json.dumps(
                    ErrorResponse(
                        request_id=getattr(request.state, "request_id", ""),
                        error_code=ErrorCode.SERVICE_BUSY,
                        message="Service is busy. Please try again shortly.",
                    ).model_dump()
                ),
                status_code=503,
                media_type="application/json",
            )

        async with generation_semaphore:
            return await call_next(request)

    return await call_next(request)


@app.middleware("http")
async def enforce_rate_limit(request: Request, call_next):
    """Enforce per-IP rate limiting (in-process; not global)."""
    if request.url.path == "/api/jd/generate" and request.method == "POST":
        client_ip = request.client.host if request.client else "unknown"

        # Clean up old entries (older than 60 seconds)
        current_time = time.time()
        ip_request_times[client_ip] = [
            t for t in ip_request_times[client_ip] if current_time - t < 60
        ]

        # Check rate limit
        request_count = len(ip_request_times[client_ip])
        if request_count >= settings.per_ip_rate_limit_per_minute:
            return Response(
                content=json.dumps(
                    ErrorResponse(
                        request_id=getattr(request.state, "request_id", ""),
                        error_code=ErrorCode.RATE_LIMITED,
                        message=f"Rate limit exceeded. Max {settings.per_ip_rate_limit_per_minute} requests per minute.",
                    ).model_dump()
                ),
                status_code=429,
                media_type="application/json",
            )

        # Record this request
        ip_request_times[client_ip].append(current_time)

    return await call_next(request)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers."""
    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'"

    return response


# ============================================================================
# Routes
# ============================================================================

# Include API routers
app.include_router(health.router)
app.include_router(jd.router)

# Serve static files
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/", StaticFiles(directory=str(static_path), html=True), name="static")
else:
    logger.warning(f"Static files directory not found: {static_path}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=settings.log_level.lower(),
    )
