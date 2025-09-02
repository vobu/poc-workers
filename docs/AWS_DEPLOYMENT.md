# AWS Deployment Setup

This guide explains how to deploy your worker-ing application to AWS using GitHub Actions.

## Prerequisites

1. AWS Account with appropriate permissions
2. AWS CLI configured locally (for initial setup)
3. Docker installed locally (for testing)

## AWS Users and Roles Setup

Before creating the infrastructure, you need to set up the necessary IAM users and roles:

### 1. Create GitHub Actions IAM User

Create an IAM user for GitHub Actions deployments:

```bash
aws iam create-user --user-name leon-worker-ing-github-actions
```

### 2. Create IAM Policies

Create a custom policy for GitHub Actions with minimal required permissions:

```bash
# Create the policy
aws iam create-policy \
    --policy-name leon-worker-ing-github-actions-policy \
    --policy-document file://aws-policies/github-actions-policy.json

# Tag the policy
aws iam tag-policy \
    --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/leon-worker-ing-github-actions-policy \
    --tags Key=Project,Value=leon-worker-ing
```

Replace `YOUR_ACCOUNT_ID` with your actual AWS account ID.

### 3. Attach Policy to GitHub Actions User

```bash
aws iam attach-user-policy \
    --user-name leon-worker-ing-github-actions \
    --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/leon-worker-ing-github-actions-policy
```

Replace `YOUR_ACCOUNT_ID` with your actual AWS account ID.

### 4. Create Access Keys for GitHub Actions

```bash
aws iam create-access-key --user-name leon-worker-ing-github-actions
```

**Important**: Save the `AccessKeyId` and `SecretAccessKey` from the output - you'll need these for GitHub secrets.

### 5. Create ECS Task Execution Role

```bash
# Create the role
aws iam create-role \
    --role-name leon-ecsTaskExecutionRole \
    --assume-role-policy-document file://aws-policies/ecs-trust-policy.json

# Tag the role
aws iam tag-role \
    --role-name leon-ecsTaskExecutionRole \
    --tags Key=Project,Value=leon-worker-ing

# Attach AWS managed policy
aws iam attach-role-policy \
    --role-name leon-ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

### 6. Create Parameter Store Access Policy for ECS Tasks

```bash
# Create the policy
aws iam create-policy \
    --policy-name leon-worker-ing-parameter-store-policy \
    --policy-document file://aws-policies/parameter-store-policy.json

# Tag the policy
aws iam tag-policy \
    --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/leon-worker-ing-parameter-store-policy \
    --tags Key=Project,Value=leon-worker-ing

# Attach the policy to the role
aws iam attach-role-policy \
    --role-name leon-ecsTaskExecutionRole \
    --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/leon-worker-ing-parameter-store-policy
```

Replace `YOUR_ACCOUNT_ID` with your actual AWS account ID.

### 7. Tag the GitHub Actions User

```bash
aws iam tag-user \
    --user-name leon-worker-ing-github-actions \
    --tags Key=Project,Value=leon-worker-ing
```

## AWS Infrastructure Setup

### 1. Create ECR Repository

```bash
aws ecr create-repository \
    --repository-name leon-worker-ing \
    --region us-east-1 \
    --tags Key=Project,Value=leon-worker-ing
```

### 2. Create ECS Cluster

```bash
aws ecs create-cluster \
    --cluster-name leon-worker-ing-cluster \
    --capacity-providers FARGATE \
    --tags Key=Project,Value=leon-worker-ing
```

### 3. Create IAM Role for ECS Task Execution

**Note**: If you followed the "AWS Users and Roles Setup" section above, you can skip this step as the role is already created.

The `leon-ecsTaskExecutionRole` should already exist with the following policies:
- `AmazonECSTaskExecutionRolePolicy`
- `leon-worker-ing-parameter-store-policy` (for Parameter Store access)

If you need to create it manually, refer to the "AWS Users and Roles Setup" section above.

### 4. Create CloudWatch Log Group

```bash
aws logs create-log-group \
    --log-group-name /ecs/leon-worker-ing \
    --region us-east-1 \
    --tags Key=Project,Value=leon-worker-ing
```

### 5. Store Secrets in AWS Systems Manager Parameter Store

Store all your environment variables as SecureString parameters in Parameter Store with proper tagging:

```bash
# Example commands (replace with your actual values)
aws ssm put-parameter \
    --name "/leon-worker-ing/ZEEBE_ADDRESS" \
    --value "your-zeebe-address" \
    --type "SecureString" \
    --tags '[{"Key":"Project","Value":"leon-worker-ing"}]'
    
aws ssm put-parameter \
    --name "/leon-worker-ing/ZEEBE_CLIENT_ID" \
    --value "your-client-id" \
    --type "SecureString" \
    --tags '[{"Key":"Project","Value":"leon-worker-ing"}]'
    
# ... repeat for all environment variables in your .env file
```

**Note**: The `scripts/setup-secrets.sh` script will automatically handle this with proper tagging.

## GitHub Repository Setup

### 1. Create GitHub Environments

1. Go to your repository → Settings → Environments
2. Create a new environment called "production"
3. Add protection rules if desired (require reviewers, restrict branches, etc.)

### 2. Add GitHub Secrets

Add the following secrets to your GitHub repository (Settings → Secrets and variables → Actions):

```
AWS_ACCESS_KEY_ID=your-access-key-from-step-4-above
AWS_SECRET_ACCESS_KEY=your-secret-key-from-step-4-above
```

**Note**: Use the access keys created for the `leon-worker-ing-github-actions` user in the "AWS Users and Roles Setup" section.

### 3. Update task-definition.json (Optional)

The `task-definition.json` file uses placeholder values (`YOUR_ACCOUNT_ID`) which are automatically replaced during deployment by GitHub Actions for security reasons. 

**You don't need to manually replace these values** - the deployment workflow will:
1. Automatically detect your AWS Account ID
2. Replace all `YOUR_ACCOUNT_ID` placeholders at deployment time
3. Keep your repository secure by not exposing account-specific information

If you want to test locally, you can temporarily replace the placeholders, but **never commit real account IDs to the repository**.

## Deployment

### Network Configuration Setup

Before creating the ECS service, you need to identify or create the required network resources:

#### Option 1: Use Default VPC (Simplest)

Find your default VPC resources:

```bash
# Get default VPC ID
DEFAULT_VPC=$(aws ec2 describe-vpcs --filters "Name=is-default,Values=true" --query 'Vpcs[0].VpcId' --output text)
echo "Default VPC: $DEFAULT_VPC"

# Get public subnets in default VPC
SUBNETS=$(aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=$DEFAULT_VPC" "Name=map-public-ip-on-launch,Values=true" \
    --query 'Subnets[*].SubnetId' --output text)
echo "Public Subnets: $SUBNETS"

# Get default security group
SECURITY_GROUP=$(aws ec2 describe-security-groups \
    --filters "Name=vpc-id,Values=$DEFAULT_VPC" "Name=group-name,Values=default" \
    --query 'SecurityGroups[0].GroupId' --output text)
echo "Default Security Group: $SECURITY_GROUP"
```

#### Option 2: Create Dedicated Resources (Recommended for Production)

**Note**: If you get an "InternetGatewayLimitExceeded" error, use Option 2b to reuse an existing VPC.

```bash
# Create VPC
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 \
    --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=leon-worker-ing-vpc},{Key=Project,Value=leon-worker-ing}]' \
    --query 'Vpc.VpcId' --output text)

# Create Internet Gateway
IGW_ID=$(aws ec2 create-internet-gateway \
    --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=leon-worker-ing-igw},{Key=Project,Value=leon-worker-ing}]' \
    --query 'InternetGateway.InternetGatewayId' --output text)

# Attach Internet Gateway to VPC
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID

# Create public subnet
SUBNET_ID=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 \
    --availability-zone us-east-1a \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=leon-worker-ing-subnet},{Key=Project,Value=leon-worker-ing}]' \
    --query 'Subnet.SubnetId' --output text)

# Enable auto-assign public IP
aws ec2 modify-subnet-attribute --subnet-id $SUBNET_ID --map-public-ip-on-launch

# Create route table
ROUTE_TABLE_ID=$(aws ec2 create-route-table --vpc-id $VPC_ID \
    --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=leon-worker-ing-rt},{Key=Project,Value=leon-worker-ing}]' \
    --query 'RouteTable.RouteTableId' --output text)

# Create route to internet gateway
aws ec2 create-route --route-table-id $ROUTE_TABLE_ID --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID

# Associate subnet with route table
aws ec2 associate-route-table --subnet-id $SUBNET_ID --route-table-id $ROUTE_TABLE_ID

# Create security group
SECURITY_GROUP_ID=$(aws ec2 create-security-group \
    --group-name leon-worker-ing-sg \
    --description "Security group for leon-worker-ing ECS tasks" \
    --vpc-id $VPC_ID \
    --tag-specifications 'ResourceType=security-group,Tags=[{Key=Name,Value=leon-worker-ing-sg},{Key=Project,Value=leon-worker-ing}]' \
    --query 'GroupId' --output text)

# Add outbound HTTPS rule (for Parameter Store and external APIs)
aws ec2 authorize-security-group-egress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0

# Add outbound HTTP rule (if needed)
aws ec2 authorize-security-group-egress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0

echo "VPC ID: $VPC_ID"
echo "Subnet ID: $SUBNET_ID"
echo "Security Group ID: $SECURITY_GROUP_ID"
```

#### Option 2b: Use Existing VPC with New Subnet (If IGW Limit Reached)

If you hit the Internet Gateway limit, reuse an existing VPC that already has internet access:

```bash
# List existing VPCs with Internet Gateways
aws ec2 describe-vpcs \
    --filters "Name=state,Values=available" \
    --query 'Vpcs[*].[VpcId,CidrBlock,Tags[?Key==`Name`].Value|[0]]' \
    --output table

# Choose a VPC and set the variable (replace with your chosen VPC ID)
VPC_ID="vpc-xxxxxxxxx"

# Get the existing Internet Gateway for this VPC
IGW_ID=$(aws ec2 describe-internet-gateways \
    --filters "Name=attachment.vpc-id,Values=$VPC_ID" \
    --query 'InternetGateways[0].InternetGatewayId' \
    --output text)

# Create a new subnet in the existing VPC (use a different CIDR block)
SUBNET_ID=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.10.0/24 \
    --availability-zone us-east-1a \
    --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=leon-worker-ing-subnet},{Key=Project,Value=leon-worker-ing}]' \
    --query 'Subnet.SubnetId' --output text)

# Enable auto-assign public IP
aws ec2 modify-subnet-attribute --subnet-id $SUBNET_ID --map-public-ip-on-launch

# Get the main route table for the VPC
ROUTE_TABLE_ID=$(aws ec2 describe-route-tables \
    --filters "Name=vpc-id,Values=$VPC_ID" "Name=association.main,Values=true" \
    --query 'RouteTables[0].RouteTableId' \
    --output text)

# Associate subnet with the main route table (if not already associated)
aws ec2 associate-route-table --subnet-id $SUBNET_ID --route-table-id $ROUTE_TABLE_ID

# Create security group
SECURITY_GROUP_ID=$(aws ec2 create-security-group \
    --group-name leon-worker-ing-sg \
    --description "Security group for leon-worker-ing ECS tasks" \
    --vpc-id $VPC_ID \
    --tag-specifications 'ResourceType=security-group,Tags=[{Key=Name,Value=leon-worker-ing-sg},{Key=Project,Value=leon-worker-ing}]' \
    --query 'GroupId' --output text)

# Add outbound HTTPS rule (for Parameter Store and external APIs)
aws ec2 authorize-security-group-egress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0

# Add outbound HTTP rule (if needed)
aws ec2 authorize-security-group-egress \
    --group-id $SECURITY_GROUP_ID \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0

echo "Using existing VPC: $VPC_ID"
echo "New Subnet ID: $SUBNET_ID"
echo "Security Group ID: $SECURITY_GROUP_ID"
```

### Manual Setup Steps

1. **First, set up network configuration using one of the options above**

2. **Register the task definition** (this step was missing):

```bash
# Get your AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Replace placeholders in task definition
sed -i.bak "s/YOUR_ACCOUNT_ID/$AWS_ACCOUNT_ID/g" task-definition.json

# Register the task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json

# Verify the task definition was created
aws ecs describe-task-definition --task-definition leon-worker-ing-task-def
```

3. Create ECS Service using the values from your network setup:

**For Default VPC:**
```bash
# Use the values from Option 1 above
aws ecs create-service \
    --cluster leon-worker-ing-cluster \
    --service-name leon-worker-ing-service \
    --task-definition leon-worker-ing-task-def \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
    --tags Key=Project,Value=leon-worker-ing
```

**For Dedicated VPC:**
```bash
# Use the values from Option 2 or 2b above
aws ecs create-service \
    --cluster leon-worker-ing-cluster \
    --service-name leon-worker-ing-service \
    --task-definition leon-worker-ing-task-def \
    --desired-count 1 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ID],securityGroups=[$SECURITY_GROUP_ID],assignPublicIp=ENABLED}" \
    --tags Key=Project,Value=leon-worker-ing
```

**Note**: Replace the variable names with the actual IDs if running commands individually.

### Automated Deployment

Once setup is complete, the GitHub Action will automatically:

1. Build your Docker image
2. Push it to ECR
3. Update the ECS task definition
4. Deploy to ECS

Trigger deployment by pushing to the `main` branch or manually via GitHub Actions tab.

## Security Best Practices

1. **Never commit secrets** to your repository
2. **Never commit AWS Account IDs** - use placeholders that are replaced at deployment time
3. **Use Parameter Store** for all sensitive environment variables
4. **Use IAM roles** with minimal required permissions
5. **Enable CloudTrail** for audit logging
6. **Use VPC** with private subnets for production deployments
7. **Enable container insights** for monitoring

## Monitoring

- View logs in CloudWatch: `/ecs/leon-worker-ing` log group
- Monitor ECS service health in AWS Console
- Set up CloudWatch alarms for container failures

## Troubleshooting

### Common Issues

1. **Task fails to start**: Check CloudWatch logs and ensure Parameter Store values are correct
2. **Cannot pull image**: Verify ECR permissions and repository exists
3. **Service deployment fails**: Check security groups allow necessary traffic
4. **Environment variables not loaded**: Verify Parameter Store paths match task definition

### Useful Commands

```bash
# View ECS service status
aws ecs describe-services --cluster leon-worker-ing-cluster --services leon-worker-ing-service

# View task logs
aws logs tail /ecs/leon-worker-ing --follow

# Update service with new task definition
aws ecs update-service --cluster leon-worker-ing-cluster --service leon-worker-ing-service --task-definition leon-worker-ing-task-def
```
