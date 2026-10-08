from enum import Enum
from pydantic import BaseModel


class ErrorCode(str, Enum):
    """Application error codes."""

    VALIDATION_ERROR = "VALIDATION_ERROR"
    THROTTLED = "THROTTLED"
    TIMEOUT = "TIMEOUT"
    MODEL_ACCESS_DENIED = "MODEL_ACCESS_DENIED"
    MALFORMED_MODEL_OUTPUT = "MALFORMED_MODEL_OUTPUT"
    SERVICE_BUSY = "SERVICE_BUSY"
    RATE_LIMITED = "RATE_LIMITED"
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ErrorResponse(BaseModel):
    """Error response body."""

    request_id: str
    error_code: ErrorCode
    message: str


class ApplicationException(Exception):
    """Base exception for JD Creator errors."""

    def __init__(self, error_code: ErrorCode, message: str, request_id: str = ""):
        self.error_code = error_code
        self.message = message
        self.request_id = request_id
        super().__init__(message)


class ModelAccessDenied(ApplicationException):
    """Raised when model access is denied."""

    def __init__(self, message: str = "Access denied to the configured Bedrock model", request_id: str = ""):
        super().__init__(ErrorCode.MODEL_ACCESS_DENIED, message, request_id)


class MalformedModelOutput(ApplicationException):
    """Raised when model output cannot be parsed after repair attempts."""

    def __init__(self, message: str = "Model output is invalid and cannot be repaired", request_id: str = ""):
        super().__init__(ErrorCode.MALFORMED_MODEL_OUTPUT, message, request_id)


class RequestTimeout(ApplicationException):
    """Raised when a request times out."""

    def __init__(self, message: str = "Request timed out", request_id: str = ""):
        super().__init__(ErrorCode.TIMEOUT, message, request_id)


class ThrottledException(ApplicationException):
    """Raised when rate-limited by Bedrock."""

    def __init__(self, message: str = "Service is temporarily throttled. Please try again later.", request_id: str = ""):
        super().__init__(ErrorCode.THROTTLED, message, request_id)
