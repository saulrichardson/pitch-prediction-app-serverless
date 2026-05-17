#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$AWS_REGION}"
export AWS_REGION AWS_DEFAULT_REGION

MODEL_ECR_REPOSITORY_NAME="${MODEL_ECR_REPOSITORY_NAME:-pitch-prediction-model-api}"
MODEL_LAMBDA_FUNCTION_NAME="${MODEL_LAMBDA_FUNCTION_NAME:-pitch-sequence-serverless-model-lambda}"
MODEL_LAMBDA_ALIAS="${MODEL_LAMBDA_ALIAS:-live}"
MODEL_LAMBDA_PROVISIONED_CONCURRENCY="${MODEL_LAMBDA_PROVISIONED_CONCURRENCY:-1}"
MODEL_LAMBDA_RESERVED_CONCURRENCY="${MODEL_LAMBDA_RESERVED_CONCURRENCY:-2}"
MODEL_LAMBDA_TIMEOUT_SECONDS="${MODEL_LAMBDA_TIMEOUT_SECONDS:-300}"
MODEL_LAMBDA_MEMORY_MB="${MODEL_LAMBDA_MEMORY_MB:-4096}"
MODEL_IMAGE_TAG="${MODEL_IMAGE_TAG:-model-serverless-$(git rev-parse --short=12 HEAD)}"
export MODEL_ECR_REPOSITORY_NAME MODEL_LAMBDA_FUNCTION_NAME MODEL_LAMBDA_ALIAS
export MODEL_LAMBDA_PROVISIONED_CONCURRENCY MODEL_LAMBDA_RESERVED_CONCURRENCY
export MODEL_LAMBDA_TIMEOUT_SECONDS MODEL_LAMBDA_MEMORY_MB MODEL_IMAGE_TAG

account_id="$(aws sts get-caller-identity --query Account --output text)"
registry="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com"
image_uri="${registry}/${MODEL_ECR_REPOSITORY_NAME}:${MODEL_IMAGE_TAG}"

echo "Building and pushing serverless model image ${image_uri}"

aws ecr describe-repositories --repository-names "${MODEL_ECR_REPOSITORY_NAME}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${MODEL_ECR_REPOSITORY_NAME}" >/dev/null

lifecycle_policy='{"rules":[{"rulePriority":1,"description":"Expire untagged images after 3 days","selection":{"tagStatus":"untagged","countType":"sinceImagePushed","countUnit":"days","countNumber":3},"action":{"type":"expire"}},{"rulePriority":2,"description":"Keep the 20 most recent tagged images","selection":{"tagStatus":"tagged","tagPatternList":["*"],"countType":"imageCountMoreThan","countNumber":20},"action":{"type":"expire"}}]}'
aws ecr put-lifecycle-policy \
  --repository-name "${MODEL_ECR_REPOSITORY_NAME}" \
  --lifecycle-policy-text "${lifecycle_policy}" >/dev/null

aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${registry}" >/dev/null

docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  -f services/model-api/Dockerfile.lambda \
  -t "${image_uri}" \
  --push \
  services/model-api

echo "Deploying PitchSequenceModelStack for ${MODEL_LAMBDA_FUNCTION_NAME}:${MODEL_LAMBDA_ALIAS}"
npm --workspace @pitch/infra run deploy:model

if [ "${MODEL_LAMBDA_PROVISIONED_CONCURRENCY}" -gt 0 ]; then
  echo "Waiting for provisioned concurrency on ${MODEL_LAMBDA_FUNCTION_NAME}:${MODEL_LAMBDA_ALIAS}"
  provisioned_status=""
  for _ in $(seq 1 90); do
    provisioned_status="$(aws lambda get-provisioned-concurrency-config \
      --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
      --qualifier "${MODEL_LAMBDA_ALIAS}" \
      --query Status \
      --output text 2>/dev/null || true)"
    if [ "${provisioned_status}" = "READY" ]; then
      break
    fi
    if [ "${provisioned_status}" = "FAILED" ]; then
      aws lambda get-provisioned-concurrency-config \
        --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
        --qualifier "${MODEL_LAMBDA_ALIAS}" >&2 || true
      exit 1
    fi
    sleep 10
  done
  if [ "${provisioned_status}" != "READY" ]; then
    echo "Provisioned concurrency did not become READY. Last status: ${provisioned_status:-unknown}" >&2
    exit 1
  fi
fi

health_file="$(mktemp)"
trap 'rm -f "${health_file}"' EXIT

aws lambda invoke \
  --function-name "${MODEL_LAMBDA_FUNCTION_NAME}:${MODEL_LAMBDA_ALIAS}" \
  --cli-binary-format raw-in-base64-out \
  --payload '{"action":"health"}' \
  "${health_file}" >/dev/null

python3 - "${health_file}" <<'PY'
from __future__ import annotations

import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

status = payload.get("health", {}).get("status")
if payload.get("ok") is not True or status != "ok":
    raise SystemExit(f"serverless model alias health check failed: {payload}")

print(f"Serverless model alias is ready: status={status}")
PY

echo "Serverless model Lambda deployed at ${MODEL_LAMBDA_FUNCTION_NAME}:${MODEL_LAMBDA_ALIAS}"
