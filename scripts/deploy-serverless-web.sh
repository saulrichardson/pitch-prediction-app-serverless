#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$AWS_REGION}"
export AWS_REGION AWS_DEFAULT_REGION

ECR_REPOSITORY_NAME="${ECR_REPOSITORY_NAME:-pitch-prediction-app}"
SERVERLESS_WEB_IMAGE_TAG="${SERVERLESS_WEB_IMAGE_TAG:-serverless-$(git rev-parse --short=12 HEAD)}"
SERVERLESS_WEB_LATEST_TAG="${SERVERLESS_WEB_LATEST_TAG:-serverless-latest}"
CUSTOM_DOMAIN_NAME="${CUSTOM_DOMAIN_NAME:-baseball.saulrichardson.io}"
ACM_CERTIFICATE_ARN="${ACM_CERTIFICATE_ARN:-arn:aws:acm:us-east-1:492205018164:certificate/62136baf-0216-4c9a-acbc-7e6e1694b0f0}"
export ECR_REPOSITORY_NAME SERVERLESS_WEB_IMAGE_TAG
export CUSTOM_DOMAIN_NAME ACM_CERTIFICATE_ARN

account_id="$(aws sts get-caller-identity --query Account --output text)"
registry="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com"
image_uri="${registry}/${ECR_REPOSITORY_NAME}:${SERVERLESS_WEB_IMAGE_TAG}"
latest_uri="${registry}/${ECR_REPOSITORY_NAME}:${SERVERLESS_WEB_LATEST_TAG}"

echo "Building and pushing serverless web image ${image_uri}"

aws ecr describe-repositories --repository-names "${ECR_REPOSITORY_NAME}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${ECR_REPOSITORY_NAME}" >/dev/null

lifecycle_policy='{"rules":[{"rulePriority":1,"description":"Expire untagged images after 3 days","selection":{"tagStatus":"untagged","countType":"sinceImagePushed","countUnit":"days","countNumber":3},"action":{"type":"expire"}},{"rulePriority":2,"description":"Keep the 20 most recent tagged images","selection":{"tagStatus":"tagged","tagPatternList":["*"],"countType":"imageCountMoreThan","countNumber":20},"action":{"type":"expire"}}]}'
aws ecr put-lifecycle-policy \
  --repository-name "${ECR_REPOSITORY_NAME}" \
  --lifecycle-policy-text "${lifecycle_policy}" >/dev/null

aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${registry}" >/dev/null

# Lambda requires a single-platform image manifest. Loading then pushing avoids
# publishing an OCI image index with provenance attestations.
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  --sbom=false \
  -f Dockerfile.web-lambda \
  -t "${image_uri}" \
  -t "${latest_uri}" \
  --load \
  .

docker push "${image_uri}"
docker push "${latest_uri}"

echo "Deploying PitchSequenceServerlessStack with image ${SERVERLESS_WEB_IMAGE_TAG}"
npm --workspace @pitch/infra run deploy:serverless

echo "Serverless web Lambda deployed from ${SERVERLESS_WEB_IMAGE_TAG}"
