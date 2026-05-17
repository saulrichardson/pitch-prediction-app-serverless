# Serverless Model Transition

The public app should run through the serverless path:

```text
CloudFront -> pitch-sequence-serverless-web -> DynamoDB
                                      |
                                      v
                    pitch-sequence-serverless-model-lambda:live
```

App Runner is not part of the product path. During the retirement window it may
remain alive only as a redirect to the serverless version.

## Cutover Order

1. Deploy the serverless model stack:

   ```bash
   scripts/deploy-serverless-model.sh
   ```

2. Build the serverless web Lambda image and deploy the serverless web stack
   with the default model target:

   ```bash
   scripts/deploy-serverless-web.sh
   ```

   The default target is:

   ```text
   pitch-sequence-serverless-model-lambda:live
   ```

   The script also preserves the production custom domain configuration from
   `docs/deployment/custom-domain.md` unless `CUSTOM_DOMAIN_NAME` and
   `ACM_CERTIFICATE_ARN` are explicitly overridden.

   During rollback, override it with:

   ```bash
   MODEL_LAMBDA_INVOKE_TARGET=pitch-sequence-model-lambda:live \
     scripts/deploy-serverless-web.sh
   ```

3. Verify the deployed serverless product:

   ```bash
   BASE_URL=https://baseball.saulrichardson.io npm run verify:product
   ```

4. Confirm the legacy App Runner service is redirect-only and not part of the
   product path.

5. Retire the old App Runner-era stack only after the new model stack is healthy
   and the web Lambda is invoking the new model alias.

## Do Not Delete Early

Do not delete `PitchSequenceLabStack` until the model cutover is complete. Before
ADR 0012, that old stack owned `pitch-sequence-model-lambda`, which the
serverless web Lambda used for predictions.

## Cleanup Target

After successful cutover, the old resources that can be retired are:

- App Runner service `pitch-sequence-lab`
- old App Runner IAM roles
- old App Runner autoscaling config
- old app secret from `PitchSequenceLabStack`
- old model Lambda `pitch-sequence-model-lambda`
- old model Lambda log group and role

Keep:

- `PitchSequenceServerlessStack`
- `PitchSequenceModelStack`
- current web and model ECR images needed for rollback
- `pitch-sequence-serverless-state`
