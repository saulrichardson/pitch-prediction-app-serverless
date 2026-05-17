import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export class PitchSequenceModelStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const repositoryName = process.env.MODEL_ECR_REPOSITORY_NAME ?? "pitch-prediction-model-api";
    const modelImageTag = process.env.MODEL_IMAGE_TAG ?? "model-serverless-latest";
    const modelFunctionName = process.env.MODEL_LAMBDA_FUNCTION_NAME ?? "pitch-sequence-serverless-model-lambda";
    const modelAliasName = process.env.MODEL_LAMBDA_ALIAS ?? "live";
    const modelMemoryMb = numberFromEnv("MODEL_LAMBDA_MEMORY_MB", 4096);
    const modelTimeoutSeconds = numberFromEnv("MODEL_LAMBDA_TIMEOUT_SECONDS", 300);
    const modelReservedConcurrency = optionalNumberFromEnv("MODEL_LAMBDA_RESERVED_CONCURRENCY") ?? 2;
    const modelProvisionedConcurrency = optionalNumberFromEnv("MODEL_LAMBDA_PROVISIONED_CONCURRENCY") ?? 1;
    const modelSampleSize = process.env.PITCHPREDICT_SAMPLE_SIZE ?? "8";
    const modelAlgorithm = process.env.PITCHPREDICT_ALGORITHM ?? "xlstm";

    const repository = ecr.Repository.fromRepositoryName(this, "ModelRepository", repositoryName);

    const modelLogGroup = new logs.LogGroup(this, "ModelFunctionLogGroup", {
      logGroupName: `/aws/lambda/${modelFunctionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const modelFunction = new lambda.DockerImageFunction(this, "ModelFunction", {
      functionName: modelFunctionName,
      code: lambda.DockerImageCode.fromEcr(repository, { tagOrDigest: modelImageTag }),
      architecture: lambda.Architecture.X86_64,
      memorySize: modelMemoryMb,
      timeout: cdk.Duration.seconds(modelTimeoutSeconds),
      reservedConcurrentExecutions: modelReservedConcurrency,
      ephemeralStorageSize: cdk.Size.mebibytes(1024),
      logGroup: modelLogGroup,
      environment: {
        ENVIRONMENT: "lambda",
        MODEL_API_AUTH_REQUIRED: "false",
        PITCHPREDICT_ALGORITHM: modelAlgorithm,
        PITCHPREDICT_SAMPLE_SIZE: modelSampleSize,
        PITCHPREDICT_WARM_ON_STARTUP: "true",
        HOME: "/tmp",
        XDG_CACHE_HOME: "/tmp/.cache",
        HF_HOME: "/tmp/huggingface",
        HUGGINGFACE_HUB_CACHE: "/tmp/huggingface/hub",
        MPLCONFIGDIR: "/tmp/matplotlib",
        TORCH_HOME: "/tmp/torch",
        PYBASEBALL_CACHE: "/tmp/pybaseball-cache",
        PITCHPREDICT_MODEL_DIR: "/tmp/pitchpredict-model",
        PITCHPREDICT_CACHE_DIR: "/tmp/pitchpredict-cache",
        PITCHPREDICT_LOG_DIR: "/tmp/pitchpredict-logs"
      }
    });

    const liveAlias = new lambda.Alias(this, "ModelLiveAlias", {
      aliasName: modelAliasName,
      version: modelFunction.currentVersion,
      ...(modelProvisionedConcurrency > 0
        ? { provisionedConcurrentExecutions: modelProvisionedConcurrency }
        : {})
    });

    new cdk.CfnOutput(this, "ModelFunctionName", {
      value: modelFunction.functionName
    });

    new cdk.CfnOutput(this, "ModelAliasName", {
      value: liveAlias.aliasName
    });

    new cdk.CfnOutput(this, "ModelInvokeTarget", {
      value: `${modelFunction.functionName}:${liveAlias.aliasName}`
    });
  }
}

function numberFromEnv(name: string, fallback: number): number {
  const value = optionalNumberFromEnv(name) ?? fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function optionalNumberFromEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number.`);
  }
  return value;
}
