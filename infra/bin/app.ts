#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { StorageStack } from '../lib/storage-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { WebSocketStack } from '../lib/websocket-stack';
import { SonicServerStack } from '../lib/sonic-server-stack';

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

// 4. WebSocket Stack — WebSocket API Gateway + Lambda (depends on Auth + Storage)
const webSocketStack = new WebSocketStack(app, 'EnglishLearningApp-WebSocketStack', {
  description: 'English Learning App - WebSocket API (Nova Sonic Real-Time Speaking)',
  wsProps: {
    auth: authStack.outputs,
    storage: storageStack.outputs,
  },
});
webSocketStack.addDependency(authStack);
webSocketStack.addDependency(storageStack);

// 5. Sonic Server Stack — Nova Sonic proxy server on EC2 t3.micro (~$8/month)
const sonicServerStack = new SonicServerStack(app, 'EnglishLearningApp-SonicServerStack', {
  description: 'English Learning App - Nova Sonic Proxy Server (EC2)',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});

// 6. Frontend Stack — Amplify Hosting
// Note: sonicServerUrl will be set manually in Amplify console after EC2 deploys
// because cross-stack references require same account/region env config.
new FrontendStack(app, 'EnglishLearningApp-FrontendStack', {
  description: 'English Learning App - Frontend Hosting (Amplify)',
  auth: authStack.outputs,
  storage: storageStack.outputs,
  apiUrl: apiStack.apiUrl,
  webSocketUrl: webSocketStack.webSocketUrl,
});
