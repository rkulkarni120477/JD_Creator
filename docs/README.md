# JD Creator

Turn hiring requirements into professional job descriptions using LLMs.

A recruiter describes a hiring requirement in natural language. The application sends it through LangChain to Amazon Bedrock, receives a validated job description in JSON, and renders it in a responsive web interface. Users can copy, download, or regenerate the JD.

## Architecture

```
Browser (Vanilla JS SPA)
    ↓
FastAPI Backend (Single origin)
    ↓
LangChain + ChatBedrockConverse
    ↓
Amazon Bedrock (Claude model)
    ↓
Validated JobDescription JSON
    ↓
Browser (Safe rendering via textContent)
```

**Key design decisions:**
- **Single origin**: Frontend and API serve from the same FastAPI instance. No CORS complexity.
- **Structured output**: Bedrock returns validated JSON matching a Pydantic schema, with one repair attempt for malformed output.
- **Safe rendering**: All text rendered via `textContent`, no `innerHTML`. XSS-safe by design.
- **Stateless**: No database. Prompts and JDs stay in memory; no cloud storage unless explicitly added.
- **Async**: Non-blocking Bedrock calls; bounded concurrency with in-process rate limiting.

## Prerequisites

- **Python 3.12** (or compatible)
- **AWS Account** with:
  - Bedrock access enabled for your chosen model (e.g., Claude 3.5 Sonnet)
  - IAM credentials configured (SSO or programmatic)
  - Model access granted in the console
- **Node.js** (optional; for JavaScript tests)
- **Docker** (optional; for container builds)
- **Terraform** (optional; for AWS deployment)

### AWS Model Access

1. Go to **AWS Bedrock Console** → **Model Catalog**
2. Find your model (e.g., "Claude 3.5 Sonnet")
3. Click **Enable** to grant your AWS account access
4. Copy the **Model ID** (e.g., `us.anthropic.claude-sonnet-4-5-20250929-v1:0`)

**Note:** Model IDs and availability vary by region. See [AWS Bedrock documentation](https://docs.aws.amazon.com/bedrock/).

### AWS Credentials

Ensure your AWS credentials are configured:

```bash
# Option 1: AWS SSO (recommended for development)
aws sso login --profile <profile-name>

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_DEFAULT_REGION=us-east-1

# Option 3: ~/.aws/credentials
[default]
aws_access_key_id = ...
aws_secret_access_key = ...
```

## Local Setup

### 1. Clone and create virtual environment

```bash
cd JD_Creator
python -m venv .venv

# On Windows
.venv\Scripts\activate

# On macOS/Linux
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -e ".[dev]"
```

This installs:
- FastAPI, Pydantic, LangChain, Boto3
- Pytest, httpx for testing
- Ruff for linting

### 3. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```dotenv
JD_AWS_REGION=us-east-1
JD_BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-5-20250929-v1:0
JD_AWS_PROFILE=         # Leave empty to use default credentials
JD_BEDROCK_TEMPERATURE=0.2
JD_BEDROCK_MAX_TOKENS=4096
JD_LOG_LEVEL=INFO
```

If you don't have a `.env` file, the app reads from environment variables prefixed with `JD_`.

### 4. Verify Bedrock access

```bash
# Start the app (requires BEDROCK_MODEL_ID set)
python -m uvicorn app.main:app --reload

# In another terminal
curl http://localhost:8000/health/ready
```

If it returns `{"status": "ready"}`, configuration is correct.

## Running Locally

### Start the development server

```bash
python -m uvicorn app.main:app --reload
```

Then open **http://localhost:8000** in your browser.

**Features:**
- Static files served from `/`
- API at `/api/jd/generate`
- Health checks at `/health/live` and `/health/ready`
- Hot reload on code changes

### Run tests

```bash
# Backend tests (Python)
pytest -v

# With coverage
pytest --cov=app tests/

# Exclude real Bedrock tests (they require credentials)
pytest -m "not bedrock_smoke"
```

```bash
# Frontend tests (JavaScript, Node.js required)
node tests/test_frontend.js
```

### Linting

```bash
ruff check app/ tests/
ruff format app/ tests/  # Auto-fix
```

## Configuration Reference

| Variable | Type | Default | Description |
|---|---|---|---|
| `JD_AWS_REGION` | string | `us-east-1` | AWS region for Bedrock |
| `JD_BEDROCK_MODEL_ID` | string | *(required)* | Model ID from Bedrock console |
| `JD_AWS_PROFILE` | string | *(none)* | Named AWS profile (optional) |
| `JD_BEDROCK_TEMPERATURE` | float | `0.2` | Model creativity (0=deterministic, 1=random) |
| `JD_BEDROCK_MAX_TOKENS` | int | `4096` | Max output length |
| `JD_BEDROCK_REQUEST_TIMEOUT_SECONDS` | float | `60` | Bedrock per-request timeout |
| `JD_BEDROCK_MAX_RETRIES` | int | `3` | Retry attempts for transient errors |
| `JD_OVERALL_DEADLINE_SECONDS` | float | `120` | Total request deadline (including retries) |
| `JD_MAX_CONCURRENT_GENERATIONS` | int | `10` | Max in-flight requests |
| `JD_MAX_REQUEST_BODY_BYTES` | int | `100000` | Max payload size (100 KB) |
| `JD_PER_IP_RATE_LIMIT_PER_MINUTE` | int | `30` | Rate limit per IP |
| `JD_LOG_LEVEL` | string | `INFO` | Logging level |

## API

### POST /api/jd/generate

Generate a job description.

**Request:**
```json
{
  "prompt": "Senior Python Developer with 5–8 years of experience in FastAPI and AWS...",
  "details": {
    "job_title": "Senior Python Developer",
    "technologies": ["Python", "FastAPI", "AWS"],
    "experience_min": 5,
    "experience_max": 8,
    "location": "Bengaluru",
    "work_arrangement": "hybrid",
    "employment_type": "full-time",
    "industry": null,
    "company_name": null,
    "company_description": null
  },
  "tone": "professional"
}
```

**Response (200 OK):**
```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "job_description": {
    "job_title": "Senior Python Developer",
    "role_summary": "...",
    "responsibilities": ["..."],
    "required_qualifications": ["..."],
    "technical_skills": ["Python", "FastAPI", "AWS"],
    "location": "Bengaluru",
    "work_arrangement": "hybrid",
    "experience": "5–8 years"
  },
  "assumptions": ["Assumed full-time employment"],
  "missing_details": ["Salary not specified"]
}
```

**Error responses (4xx, 5xx):**
```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "error_code": "VALIDATION_ERROR",
  "message": "Prompt must contain at least 10 characters"
}
```

### GET /health/live

Liveness probe; always returns 200 if the service is running.

### GET /health/ready

Readiness probe; returns 200 if Bedrock model is configured, 503 otherwise.

## Docker

### Build the image

```bash
docker build -t jd-creator:latest .
```

### Run locally

```bash
docker run --rm \
  -p 8000:8000 \
  -e JD_BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-5-20250929-v1:0 \
  -e AWS_PROFILE=default \
  -v ~/.aws:/root/.aws:ro \
  jd-creator:latest
```

Then open **http://localhost:8000**.

### Push to ECR

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

docker tag jd-creator:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/jd-creator:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/jd-creator:latest
```

**Note:** Docker must be installed locally. Windows users may use Docker Desktop or WSL2.

## AWS Deployment

### Prerequisites

- Terraform (v1.0+) installed
- AWS credentials configured
- Bedrock model access enabled in your region

### 1. Prepare Terraform variables

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`:
```hcl
aws_region       = "us-east-1"
bedrock_model_id = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
desired_count    = 2
task_cpu         = "256"
task_memory      = "512"
```

### 2. Plan deployment

```bash
terraform init
terraform plan -out=tfplan
```

Review the resources to be created.

### 3. Apply (when ready)

```bash
terraform apply tfplan
```

This creates:
- **VPC** with public/private subnets
- **Application Load Balancer** (ALB) with target group
- **ECS Fargate cluster** with auto-scaling
- **CloudWatch logs** with 7-day retention
- **ECR repository** for Docker images
- **IAM roles** with minimal Bedrock permissions

**Important:** The application itself is not deployed. You must:

1. Build and push the Docker image (see Docker section above)
2. Update the ECS service to use the pushed image
3. Or use the provided GitHub Actions workflow (not included in this baseline)

### 4. Access the application

```bash
# Get load balancer DNS
terraform output alb_dns_name

# Visit http://<dns-name>
```

(HTTPS requires a domain name and ACM certificate; see `infra/terraform/variables.tf`)

### 5. Monitor logs

```bash
aws logs tail /ecs/jd-creator --follow
```

### 6. Cleanup

```bash
terraform destroy
```

**⚠️ This deletes all resources, including databases if any were added.**

## Cost Drivers

**Bedrock** (per-invocation model inference):
- Input tokens: ~$0.003 per 1M tokens (Claude 3.5 Sonnet)
- Output tokens: ~$0.015 per 1M tokens
- ~100-200 input tokens per request, ~500-1000 output tokens per response
- **Estimate:** $0.005–$0.02 per request

**Fargate** (container runtime):
- vCPU: $0.04464 per hour (256 vCPU = 0.25 vCPU)
- Memory: $0.004843 per GB-hour (512 MB = 0.5 GB)
- **Estimate:** ~$0.05/hour for 1 task; $0.30/hour for 2 tasks

**Application Load Balancer**:
- Hourly charge: $0.0225/hour
- Per LCU: $0.006 (Light Content Unit, ~25 requests/min)

**NAT Gateway** (if not using VPC endpoint):
- Hourly: $0.045/hour
- Data processing: $0.045 per GB

**CloudWatch Logs**:
- Log ingestion: $0.50 per GB
- Log storage: $0.03 per GB-month (7-day retention ≈ $0.007/GB)

**CloudWatch Monitoring** (Container Insights):
- ~$0.01 per task-hour

**Rough monthly estimate (single task, 100 requests/day):**
- Bedrock: ~$15 (0.02 × 100 × 30)
- Fargate: ~$37 (0.05 × 730 hours)
- ALB: ~$17 (0.0225 × 730)
- NAT: ~$33 (0.045 × 730)
- CloudWatch: ~$10 (combined)
- **Total: ~$110/month**

Use the **Bedrock VPC endpoint** ($7/month) instead of NAT to save ~$26/month.

## Testing

### Unit Tests

```bash
# Backend (Python)
pytest tests/test_schemas.py -v
pytest tests/test_jd_service.py -v
pytest tests/test_api.py -v

# Frontend (JavaScript)
node tests/test_frontend.js
```

### Real Bedrock Smoke Test

```bash
RUN_BEDROCK_SMOKE=1 pytest tests/test_bedrock_smoke.py -v
```

Requires valid AWS credentials and Bedrock model access.

### Manual Testing Checklist

- [ ] Load frontend at http://localhost:8000
- [ ] Fill in natural language requirement
- [ ] Submit form; wait for "Creating your job description…"
- [ ] Generated JD appears with correct formatting
- [ ] Click Copy → Markdown copied to clipboard
- [ ] Click Download → `.md` file downloaded
- [ ] Click Regenerate → New response appears
- [ ] Click Clear → Form reset, results hidden
- [ ] Modify optional fields and regenerate
- [ ] Test on mobile (narrow viewport)
- [ ] Try empty/invalid inputs → errors appear with request ID
- [ ] Test keyboard navigation (Tab, Shift+Tab, Enter)
- [ ] Check Security headers (DevTools → Network → response headers)

## Known Limitations

1. **No user authentication** (dev/test deployment). Production deployments include Cognito.
2. **No request history** or persistence. Each request is independent.
3. **No custom templates** or role libraries. Every JD is generated from scratch.
4. **Rate limiting is per-task**. Multiple ECS tasks have independent limits. Use ALB/WAF rules for global limits.
5. **No multipart file upload** for JDs or resumes.
6. **Bedrock availability** by region. Check [AWS Bedrock regions](https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html).

## Future Enhancements

- [ ] User authentication and saved JD history
- [ ] Role templates (e.g., "Start from Software Engineer template")
- [ ] Markdown/ATS export formats (PDF, Google Docs)
- [ ] Batch JD generation from CSV
- [ ] Custom prompt management and versioning
- [ ] Analytics dashboard (most common roles, avg response time)
- [ ] Integration with job boards (LinkedIn, Indeed)
- [ ] Multi-language support and localization

## Implementation Status

| Component | Status | Verified | Notes |
|---|---|---|---|
| **Backend API** | ✅ Implemented | ✅ Pytest | FastAPI with LangChain/Bedrock |
| **Frontend UI** | ✅ Implemented | ✅ Browser | Vanilla JS, CSS Grid, accessible |
| **Database** | ❌ Not included | — | Stateless by design |
| **Authentication** | ⚠️ Partial | — | Cognito in Terraform (not applied) |
| **Docker** | ✅ Implemented | ⚠️ Not verified locally | Requires Docker installation |
| **Terraform** | ✅ Implemented | ⚠️ Plan only | Not applied; requires AWS account |
| **Tests** | ✅ Implemented | ✅ Pytest, Node | Mocked Bedrock responses |
| **Bedrock Integration** | ✅ Implemented | ⚠️ Requires account | ChatBedrockConverse with structured output |

**Legend:**
- ✅ = Complete and working
- ⚠️ = Implemented but not locally tested (requires external resources)
- ❌ = Not in scope

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes and test: `pytest`
3. Commit: `git commit -m "feat: describe your change"`
4. Push and open a pull request

## License

MIT

## Support

For questions:
1. Check this README and the code comments
2. Review the [AWS Bedrock documentation](https://docs.aws.amazon.com/bedrock/)
3. Open a GitHub issue with your question and error message

---

**Last updated:** October 2026  
**Version:** 0.1.0
#   J D _ C r e a t o r  
 