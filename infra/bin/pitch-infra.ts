#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { PitchSequenceModelStack } from "../lib/pitch-sequence-model-stack";
import { PitchSequenceServerlessStack } from "../lib/pitch-sequence-serverless-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1"
};

new PitchSequenceModelStack(app, "PitchSequenceModelStack", {
  env
});

new PitchSequenceServerlessStack(app, "PitchSequenceServerlessStack", {
  env
});
