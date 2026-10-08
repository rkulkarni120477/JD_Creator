# AWS Setup Guide for JD Creator

## Getting AWS Credentials

There are three ways to provide AWS credentials to JD Creator:

### Option 1: AWS SSO (Recommended for Development) ✅

If your organization uses AWS SSO:

```bash
# Configure SSO profile
aws configure sso --profile default

# When prompted:
# SSO start URL: https://your-org.awsapps.com/start
# SSO Region: us-east-1 (or your region)
# CLI default region: us-east-1
# CLI default output: json

# Login to AWS
aws sso login --profile default

# Verify access
aws sts get-caller-identity --profile default
```

Then set in `.env`:
```dotenv
JD_AWS_PROFILE=default
```

### Option 2: Programmatic Access (Access Key + Secret) 

If using programmatic access:

1. **Create IAM User** in AWS Console:
   - AWS Console → IAM → Users → Create User
   - Enable "Programmatic access"
   - Add policy: `AmazonBedrockFullAccess`
   - Save Access Key ID and Secret Access Key

2. **Set in .env**:
```dotenv
# Option A: Environment variables (preferred for production)
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here

# Option B: Or use AWS credentials file
JD_AWS_PROFILE=jd-creator
```

3. **Or create ~/.aws/credentials**:
```
[jd-creator]
aws_access_key_id = your_access_key_here
aws_secret_access_key = your_secret_key_here
region = us-east-1
```

### Option 3: AWS CLI Default Credentials

If AWS CLI is already configured:

```bash
aws configure
# Enter your Access Key ID and Secret
# Region: us-east-1 (or your region)
```

JD Creator will automatically use the default profile.

---

## Step 1: Enable Bedrock Access

1. **Go to AWS Console** → **Bedrock** → **Model Access**
2. **Find your desired model** (e.g., "Claude 3.5 Sonnet")
3. **Click "Enable"** to grant your account access
4. **Copy the Model ID** (e.g., `anthropic.claude-3-5-sonnet-20241022-v2:0`)

⚠️ **Important**: You must enable model access before using it, or you'll get an `AccessDeniedException`.

---

## Step 2: Configure .env

Edit `.env`:

```dotenv
# Your region
JD_AWS_REGION=us-east-1

# Your profile name (if using Option 1 or 3)
JD_AWS_PROFILE=default

# Model ID from Bedrock console
JD_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
```

---

## Step 3: Verify Configuration

```bash
# Check AWS access
aws sts get-caller-identity

# Check Bedrock model availability
aws bedrock list-foundation-models --region us-east-1 | grep Claude

# Test the app
python -m uvicorn app.main:app --reload
curl http://localhost:8000/health/ready
```

If `/health/ready` returns `{"status": "ready"}`, you're configured correctly.

---

## Troubleshooting

### "BEDROCK_MODEL_ID is required"
- Set `JD_BEDROCK_MODEL_ID` in `.env`
- Model ID must be exact (e.g., `anthropic.claude-3-5-sonnet-20241022-v2:0`)

### "AccessDeniedException" or "Model access not granted"
- Go to AWS Bedrock → Model Access
- Click "Enable" on your model
- Wait a minute for access to propagate

### "Unable to locate credentials"
- Verify `.env` is in project root
- Check `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set
- Or verify `~/.aws/credentials` exists with your profile
- Run `aws sts get-caller-identity` to test AWS CLI

### "User: arn:aws:iam::... is not authorized to perform: bedrock:InvokeModel"
- Go to IAM → Users → Your User
- Attach policy: `AmazonBedrockFullAccess`
- Or create custom policy with Bedrock permissions

### "The model does not exist"
- Double-check model ID spelling
- Verify model is available in your region
- Some models are region-specific

---

## Security Best Practices

✅ **Do:**
- Use AWS SSO when available
- Use IAM roles for production deployments (Terraform handles this)
- Rotate access keys quarterly
- Add `.env` to `.gitignore` (already done)
- Use least-privilege IAM policies

❌ **Don't:**
- Commit `.env` with real credentials to git
- Hardcode credentials in code
- Share access keys via email or chat
- Use root account credentials
- Leave credentials in bash history

---

## For Production (AWS Deployment)

When deploying with Terraform:

1. **ECS Task Role** automatically gets Bedrock permissions
   - No .env needed; IAM role provides access
   - Terraform configures this in `main.tf`

2. **Cognito Authentication** (optional)
   - Set `domain_name` and `certificate_arn` in `terraform.tfvars`

3. **No secrets in Docker image**
   - Credentials come from ECS task role or Secrets Manager

---

## Testing Without Real AWS

If you don't have AWS access yet, you can:

1. **Run tests with mocked Bedrock**:
```bash
pytest -m "not bedrock_smoke"
```

2. **Use the fake model in tests**:
- Tests inject a mock Bedrock response
- All validation and formatting tested without AWS

3. **Get AWS Free Tier access**:
- Sign up at https://aws.amazon.com/free
- 12 months free tier includes Bedrock requests (limited)

---

## Questions?

Refer to:
- [AWS Bedrock Console](https://console.aws.amazon.com/bedrock)
- [AWS CLI Documentation](https://docs.aws.amazon.com/cli/)
- [Bedrock Model IDs](https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html)
- README.md for architecture details
