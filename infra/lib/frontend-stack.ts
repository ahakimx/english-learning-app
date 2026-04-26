import * as cdk from 'aws-cdk-lib';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import { Construct } from 'constructs';
import { AuthStackOutputs, StorageStackOutputs } from './types';

export interface FrontendStackProps extends cdk.StackProps {
  auth: AuthStackOutputs;
  storage: StorageStackOutputs;
  apiUrl: string;
  webSocketUrl?: string;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { auth, storage, apiUrl, webSocketUrl } = props;

    // AWS Amplify App for React/Vite SPA
    const amplifyApp = new amplify.CfnApp(this, 'EnglishLearningAmplifyApp', {
      name: 'EnglishLearningApp',
      platform: 'WEB_COMPUTE',
      buildSpec: [
        'version: 1',
        'frontend:',
        '  phases:',
        '    preBuild:',
        '      commands:',
        '        - npm ci',
        '    build:',
        '      commands:',
        '        - npm run build',
        '  artifacts:',
        '    baseDirectory: dist',
        '    files:',
        '      - "**/*"',
        '  cache:',
        '    paths:',
        '      - node_modules/**/*',
      ].join('\n'),
      // SPA rewrite rule: serve index.html for all routes
      customRules: [
        {
          source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>',
          target: '/index.html',
          status: '200',
        },
      ],
      // Environment variables wired from other stacks (Vite requires VITE_ prefix)
      environmentVariables: [
        { name: 'VITE_API_URL', value: apiUrl },
        { name: 'VITE_USER_POOL_ID', value: auth.userPoolId },
        { name: 'VITE_USER_POOL_CLIENT_ID', value: auth.userPoolClientId },
        { name: 'VITE_IDENTITY_POOL_ID', value: auth.identityPoolId },
        { name: 'VITE_AUDIO_BUCKET_NAME', value: storage.audioBucketName },
        { name: 'VITE_AWS_REGION', value: cdk.Aws.REGION },
        ...(webSocketUrl ? [{ name: 'VITE_WEBSOCKET_URL', value: webSocketUrl }] : []),
      ],
    });

    // Branch is managed via Amplify Console after connecting GitHub repo

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: amplifyApp.attrAppId,
      description: 'Amplify App ID',
    });

    new cdk.CfnOutput(this, 'AmplifyAppDefaultDomain', {
      value: amplifyApp.attrDefaultDomain,
      description: 'Amplify App Default Domain',
    });
  }
}
