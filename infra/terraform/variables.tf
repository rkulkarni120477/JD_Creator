variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region for deployment"
}

variable "environment" {
  type        = string
  default     = "dev"
  description = "Environment name (dev, staging, prod)"
}

variable "bedrock_model_id" {
  type        = string
  description = "Bedrock model ID or inference profile ARN (e.g., anthropic.claude-3-5-sonnet-20241022-v2:0)"
}

variable "create_vpc" {
  type        = bool
  default     = true
  description = "Create a new VPC for the application"
}

variable "vpc_cidr" {
  type        = string
  default     = "10.0.0.0/16"
  description = "CIDR block for the VPC"
}

variable "public_subnet_cidrs" {
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
  description = "CIDR blocks for public subnets"
}

variable "private_subnet_cidrs" {
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
  description = "CIDR blocks for private subnets"
}

variable "create_bedrock_vpc_endpoint" {
  type        = bool
  default     = false
  description = "Create VPC endpoint for Bedrock (alternative to NAT gateway)"
}

variable "task_cpu" {
  type        = string
  default     = "256"
  description = "Fargate task CPU units (256, 512, 1024, etc.)"
}

variable "task_memory" {
  type        = string
  default     = "512"
  description = "Fargate task memory in MB (512, 1024, 2048, etc.)"
}

variable "desired_count" {
  type        = number
  default     = 1
  description = "Desired number of ECS tasks"
}

variable "log_retention_days" {
  type        = number
  default     = 7
  description = "CloudWatch log retention in days"
}

variable "domain_name" {
  type        = string
  default     = ""
  description = "Domain name for the application (enables HTTPS and Cognito auth)"
}

variable "certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN for HTTPS (required if domain_name is set)"
}
