import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export class PitchSequenceServerlessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const repositoryName = process.env.ECR_REPOSITORY_NAME ?? "pitch-prediction-app";
    const webImageTag = process.env.SERVERLESS_WEB_IMAGE_TAG ?? process.env.IMAGE_TAG ?? "serverless-latest";
    const modelFunctionName = process.env.MODEL_LAMBDA_FUNCTION_NAME ?? "pitch-sequence-serverless-model-lambda";
    const modelInvokeTarget = process.env.MODEL_LAMBDA_INVOKE_TARGET ?? `${modelFunctionName}:live`;
    const webMemoryMb = Number(process.env.SERVERLESS_WEB_MEMORY_MB ?? "2048");
    const webTimeoutSeconds = Number(process.env.SERVERLESS_WEB_TIMEOUT_SECONDS ?? "300");
    const webReservedConcurrency = process.env.SERVERLESS_WEB_RESERVED_CONCURRENCY
      ? Number(process.env.SERVERLESS_WEB_RESERVED_CONCURRENCY)
      : undefined;
    const customDomainName = process.env.CUSTOM_DOMAIN_NAME;
    const certificateArn = process.env.ACM_CERTIFICATE_ARN;

    if ((customDomainName && !certificateArn) || (!customDomainName && certificateArn)) {
      throw new Error("CUSTOM_DOMAIN_NAME and ACM_CERTIFICATE_ARN must be configured together.");
    }

    const repository = ecr.Repository.fromRepositoryName(this, "Repository", repositoryName);
    const modelFunctionArn = cdk.Stack.of(this).formatArn({
      service: "lambda",
      resource: "function",
      resourceName: modelInvokeTarget,
      arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME
    });
    const webFunctionArn = cdk.Stack.of(this).formatArn({
      service: "lambda",
      resource: "function",
      resourceName: "pitch-sequence-serverless-web",
      arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME
    });
    const modelFunction = lambda.Function.fromFunctionArn(this, "ModelFunction", modelFunctionArn);

    const table = new dynamodb.Table(this, "StateTable", {
      tableName: "pitch-sequence-serverless-state",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const appSecret = new secretsmanager.Secret(this, "AppSecrets", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "sessionSecret",
        passwordLength: 64,
        excludePunctuation: true
      }
    });

    const webLogGroup = new logs.LogGroup(this, "WebFunctionLogGroup", {
      logGroupName: "/aws/lambda/pitch-sequence-serverless-web",
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const webFunction = new lambda.DockerImageFunction(this, "WebFunction", {
      functionName: "pitch-sequence-serverless-web",
      code: lambda.DockerImageCode.fromEcr(repository, { tagOrDigest: webImageTag }),
      architecture: lambda.Architecture.X86_64,
      memorySize: webMemoryMb,
      timeout: cdk.Duration.seconds(webTimeoutSeconds),
      reservedConcurrentExecutions: webReservedConcurrency,
      ephemeralStorageSize: cdk.Size.mebibytes(1024),
      logGroup: webLogGroup,
      environment: {
        NODE_ENV: "production",
        STORAGE_MODE: "dynamodb",
        DYNAMODB_TABLE_NAME: table.tableName,
        MODEL_BACKEND: "lambda",
        MODEL_LAMBDA_FUNCTION_NAME: modelInvokeTarget,
        MODEL_REQUEST_TIMEOUT_MS: String(Math.min(webTimeoutSeconds * 1000 - 5000, 55000)),
        BACKGROUND_MODEL_REQUEST_TIMEOUT_MS: String(Math.min(webTimeoutSeconds * 1000 - 10000, 290000)),
        TIMELINE_WORKER_LAMBDA_FUNCTION_NAME: "pitch-sequence-serverless-web",
        APP_SECRET_JSON: appSecret.secretValue.toString(),
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1"
      }
    });

    table.grantReadWriteData(webFunction);
    modelFunction.grantInvoke(webFunction);
    webFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ["lambda:InvokeFunction"],
      resources: [webFunctionArn]
    }));

    const functionUrl = webFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE
    });

    const certificate = certificateArn
      ? acm.Certificate.fromCertificateArn(this, "CustomDomainCertificate", certificateArn)
      : undefined;

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: new origins.FunctionUrlOrigin(functionUrl, {
          readTimeout: cdk.Duration.seconds(60),
          keepaliveTimeout: cdk.Duration.seconds(60)
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      ...(customDomainName && certificate
        ? {
          domainNames: [customDomainName],
          certificate,
          minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021
        }
        : {}),
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      comment: "Pitch Prediction App serverless web/API distribution"
    });

    new cdk.CfnOutput(this, "ServerlessWebUrl", {
      value: `https://${distribution.distributionDomainName}`
    });

    if (customDomainName) {
      new cdk.CfnOutput(this, "CustomDomainUrl", {
        value: `https://${customDomainName}`
      });
    }

    new cdk.CfnOutput(this, "ServerlessStateTableName", {
      value: table.tableName
    });

    new cdk.CfnOutput(this, "ServerlessWebFunctionName", {
      value: webFunction.functionName
    });
  }
}
