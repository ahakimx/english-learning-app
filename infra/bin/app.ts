#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { StorageStack } from '../lib/storage-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

// 1. Auth Stack — Cognito User Pool (no dependencies)
const authStack = new AuthStack(app, 'EnglishLearningApp-AuthStack', {
  description: 'English Learning App - Authentication (Cognito)',
});

// 2. Storage Stack — DynamoDB + S3 (no dependencies)
const storageStack = new StorageStack(app, 'EnglishLearningApp-StorageStack', {
  description: 'English Learning App - Data Storage (DynamoDB + S3)',
});

// 3. API Stack — API Gateway + Lambda (depends on Auth + Storage)
const apiStack = new ApiStack(app, 'EnglishLearningApp-ApiStack', {
  description: 'English Learning App - API Layer (API Gateway + Lambda)',
  apiProps: {
    auth: authStack.outputs,
    storage: storageStack.outputs,
  },
});
apiStack.addDependency(authStack);
apiStack.addDependency(storageStack);

// 4. Frontend Stack — Amplify Hosting (depends on Auth + Storage + API)
new FrontendStack(app, 'EnglishLearningApp-FrontendStack', {
  description: 'English Learning App - Frontend Hosting (Amplify)',
  auth: authStack.outputs,
  storage: storageStack.outputs,
  apiUrl: apiStack.apiUrl,
});
