terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "jd-creator"
      Environment = var.environment
      Terraform   = "true"
    }
  }
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_availability_zones" "available" {
  state = "available"
}

# ============================================================================
# Locals
# ============================================================================

locals {
  app_name = "jd-creator"
  container_port = 8000
  log_group_name = "/ecs/${local.app_name}"
}

# ============================================================================
# CloudWatch Log Group
# ============================================================================

resource "aws_cloudwatch_log_group" "ecs" {
  name              = local.log_group_name
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${local.app_name}-logs"
  }
}

# ============================================================================
# ECR Repository
# ============================================================================

resource "aws_ecr_repository" "app" {
  name                 = local.app_name
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = local.app_name
  }
}

# ============================================================================
# VPC (Optional - use existing or create new)
# ============================================================================

resource "aws_vpc" "main" {
  count             = var.create_vpc ? 1 : 0
  cidr_block        = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${local.app_name}-vpc"
  }
}

resource "aws_subnet" "private" {
  count             = var.create_vpc ? 2 : 0
  vpc_id            = aws_vpc.main[0].id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${local.app_name}-private-subnet-${count.index + 1}"
  }
}

resource "aws_subnet" "public" {
  count             = var.create_vpc ? 2 : 0
  vpc_id            = aws_vpc.main[0].id
  cidr_block        = var.public_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${local.app_name}-public-subnet-${count.index + 1}"
  }
}

resource "aws_internet_gateway" "main" {
  count  = var.create_vpc ? 1 : 0
  vpc_id = aws_vpc.main[0].id

  tags = {
    Name = "${local.app_name}-igw"
  }
}

resource "aws_eip" "nat" {
  count  = var.create_vpc ? 1 : 0
  domain = "vpc"

  tags = {
    Name = "${local.app_name}-nat-eip"
  }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  count         = var.create_vpc ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "${local.app_name}-nat"
  }

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route_table" "public" {
  count  = var.create_vpc ? 1 : 0
  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main[0].id
  }

  tags = {
    Name = "${local.app_name}-public-rt"
  }
}

resource "aws_route_table" "private" {
  count  = var.create_vpc ? 1 : 0
  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main[0].id
  }

  tags = {
    Name = "${local.app_name}-private-rt"
  }
}

resource "aws_route_table_association" "public" {
  count       = var.create_vpc ? 2 : 0
  subnet_id   = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_route_table_association" "private" {
  count       = var.create_vpc ? 2 : 0
  subnet_id   = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
}

# ============================================================================
# Bedrock VPC Endpoint (Optional)
# ============================================================================

resource "aws_vpc_endpoint" "bedrock" {
  count             = var.create_vpc && var.create_bedrock_vpc_endpoint ? 1 : 0
  vpc_id            = aws_vpc.main[0].id
  service_name      = "com.amazonaws.${var.aws_region}.bedrock-runtime"
  vpc_endpoint_type = "Interface"
  subnet_ids        = aws_subnet.private[*].id

  security_group_ids = [aws_security_group.vpc_endpoint[0].id]
  private_dns_enabled = true

  tags = {
    Name = "${local.app_name}-bedrock-endpoint"
  }
}

resource "aws_security_group" "vpc_endpoint" {
  count       = var.create_vpc && var.create_bedrock_vpc_endpoint ? 1 : 0
  vpc_id      = aws_vpc.main[0].id
  name_prefix = "${local.app_name}-bedrock-endpoint-"

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    security_groups = [aws_security_group.ecs_tasks[0].id]
  }

  tags = {
    Name = "${local.app_name}-bedrock-endpoint-sg"
  }
}

# ============================================================================
# Security Groups
# ============================================================================

resource "aws_security_group" "alb" {
  count       = var.create_vpc ? 1 : 0
  name_prefix = "${local.app_name}-alb-"
  vpc_id      = aws_vpc.main[0].id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.app_name}-alb-sg"
  }
}

resource "aws_security_group" "ecs_tasks" {
  count       = var.create_vpc ? 1 : 0
  name_prefix = "${local.app_name}-ecs-"
  vpc_id      = aws_vpc.main[0].id

  ingress {
    from_port       = local.container_port
    to_port         = local.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb[0].id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.app_name}-ecs-sg"
  }
}

# ============================================================================
# Load Balancer
# ============================================================================

resource "aws_lb" "main" {
  count              = var.create_vpc ? 1 : 0
  name_prefix        = "jdc"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb[0].id]
  subnets            = aws_subnet.public[*].id

  enable_deletion_protection = false

  tags = {
    Name = "${local.app_name}-alb"
  }
}

resource "aws_lb_target_group" "app" {
  count            = var.create_vpc ? 1 : 0
  name_prefix      = "app"
  port             = local.container_port
  protocol         = "HTTP"
  vpc_id           = aws_vpc.main[0].id
  target_type      = "ip"

  health_check {
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health/live"
    matcher             = "200"
  }

  tags = {
    Name = "${local.app_name}-tg"
  }
}

resource "aws_lb_listener" "http" {
  count            = var.create_vpc ? 1 : 0
  load_balancer_arn = aws_lb.main[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  count            = var.create_vpc && var.domain_name != "" ? 1 : 0
  load_balancer_arn = aws_lb.main[0].arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "authenticate-cognito"
    authenticate_cognito_config {
      user_pool_arn       = aws_cognito_user_pool.main[0].arn
      user_pool_client_id = aws_cognito_user_pool_client.main[0].id
      user_pool_domain    = aws_cognito_user_pool_domain.main[0].domain
    }

    order = 1
  }

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app[0].arn
    order            = 2
  }

  depends_on = [
    aws_cognito_user_pool.main,
    aws_cognito_user_pool_client.main,
    aws_cognito_user_pool_domain.main
  ]
}

resource "aws_lb_listener" "http_app" {
  count            = var.create_vpc && var.domain_name == "" ? 1 : 0
  load_balancer_arn = aws_lb.main[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app[0].arn
  }
}

# ============================================================================
# Cognito (for production deployments with domain)
# ============================================================================

resource "aws_cognito_user_pool" "main" {
  count = var.create_vpc && var.domain_name != "" ? 1 : 0
  name  = "${local.app_name}-pool"

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  tags = {
    Name = "${local.app_name}-cognito-pool"
  }
}

resource "aws_cognito_user_pool_client" "main" {
  count        = var.create_vpc && var.domain_name != "" ? 1 : 0
  user_pool_id = aws_cognito_user_pool.main[0].id
  name         = "${local.app_name}-client"

  allowed_oauth_flows = ["code"]
  allowed_oauth_scopes = ["openid"]
  allowed_oauth_flows_user_pool_client = true
  callback_urls = ["https://${var.domain_name}/oauth2/idpresponse"]
  logout_urls   = ["https://${var.domain_name}"]

  tags = {
    Name = "${local.app_name}-cognito-client"
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  count           = var.create_vpc && var.domain_name != "" ? 1 : 0
  domain          = "${local.app_name}-${data.aws_caller_identity.current.account_id}"
  user_pool_id    = aws_cognito_user_pool.main[0].id
}

data "aws_caller_identity" "current" {}

# ============================================================================
# ECS Cluster and Service
# ============================================================================

resource "aws_ecs_cluster" "main" {
  name = local.app_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = local.app_name
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

resource "aws_ecs_task_definition" "app" {
  family                   = local.app_name
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = local.app_name
      image     = "${aws_ecr_repository.app.repository_url}:latest"
      essential = true
      portMappings = [
        {
          containerPort = local.container_port
          protocol      = "tcp"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
      environment = [
        {
          name  = "JD_AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "JD_BEDROCK_MODEL_ID"
          value = var.bedrock_model_id
        },
        {
          name  = "JD_LOG_LEVEL"
          value = "INFO"
        }
      ]
    }
  ])

  tags = {
    Name = "${local.app_name}-task-def"
  }
}

resource "aws_ecs_service" "app" {
  count           = var.create_vpc ? 1 : 0
  name            = local.app_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs_tasks[0].id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app[0].arn
    container_name   = local.app_name
    container_port   = local.container_port
  }

  depends_on = [
    aws_lb_listener.https,
    aws_lb_listener.http_app
  ]

  tags = {
    Name = "${local.app_name}-service"
  }
}

resource "aws_appautoscaling_target" "ecs_target" {
  count              = var.create_vpc ? 1 : 0
  max_capacity       = 4
  min_capacity       = var.desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app[0].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ecs_policy" {
  count              = var.create_vpc ? 1 : 0
  policy_name        = "${local.app_name}-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs_target[0].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs_target[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs_target[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value = 70.0
  }
}

# ============================================================================
# IAM Roles
# ============================================================================

resource "aws_iam_role" "ecs_task_execution" {
  name_prefix = "${local.app_name}-ecs-execution-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${local.app_name}-ecs-execution-role"
  }
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_task_execution_ecr" {
  name_prefix = "${local.app_name}-ecs-execution-ecr-"
  role        = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task_role" {
  name_prefix = "${local.app_name}-ecs-task-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${local.app_name}-ecs-task-role"
  }
}

resource "aws_iam_role_policy" "bedrock_access" {
  name_prefix = "${local.app_name}-bedrock-access-"
  role        = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream"
        ]
        Resource = [
          "arn:aws:bedrock:${var.aws_region}::foundation-model/${var.bedrock_model_id}",
          "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.current.account_id}:inference-profile/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = "bedrock:GetInferenceProfile"
        Resource = "*"
      }
    ]
  })
}

# ============================================================================
# Outputs
# ============================================================================

output "alb_dns_name" {
  value       = try(aws_lb.main[0].dns_name, "")
  description = "DNS name of the load balancer"
}

output "ecr_repository_url" {
  value       = aws_ecr_repository.app.repository_url
  description = "ECR repository URL for pushing Docker images"
}

output "log_group_name" {
  value       = aws_cloudwatch_log_group.ecs.name
  description = "CloudWatch log group name"
}
