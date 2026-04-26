import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AuthStack } from '../lib/auth-stack';
import { StorageStack } from '../lib/storage-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';

// --- StorageStack Tests ---
describe('StorageStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new StorageStack(app, 'TestStorageStack');
    template = Template.fromStack(stack);
  });

  test('has 2 DynamoDB tables', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 2);
  });

  test('Sessions table has correct partition key (userId) and sort key (sessionId)', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'EnglishLearningApp-Sessions',
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'sessionId', KeyType: 'RANGE' },
      ],
    });
  });

  test('Sessions table has GSI (sessionId-index)', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'EnglishLearningApp-Sessions',
      GlobalSecondaryIndexes: [
        Match.objectLike({
          IndexName: 'sessionId-index',
          KeySchema: [
            { AttributeName: 'sessionId', KeyType: 'HASH' },
          ],
        }),
      ],
    });
  });

  test('Progress table has correct partition key (userId) and sort key (moduleType)', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'EnglishLearningApp-Progress',
      KeySchema: [
        { AttributeName: 'userId', KeyType: 'HASH' },
        { AttributeName: 'moduleType', KeyType: 'RANGE' },
      ],
    });
  });

  test('has S3 bucket with encryption enabled', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          },
        ],
      },
    });
  });

  test('S3 bucket blocks public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('S3 bucket enforces SSL (HTTPS/TLS) for data in transit', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: {
              Bool: { 'aws:SecureTransport': 'false' },
            },
          }),
        ]),
      },
    });
  });
});


// --- AuthStack Tests ---
describe('AuthStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new AuthStack(app, 'TestAuthStack');
    template = Template.fromStack(stack);
  });

  test('has Cognito User Pool', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
  });

  test('User Pool has email sign-in configured', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
    });
  });

  test('has User Pool Client', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
  });
});

// --- ApiStack Tests ---
describe('ApiStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new ApiStack(app, 'TestApiStack', {
      apiProps: {
        auth: {
          userPoolId: 'test-pool-id',
          userPoolClientId: 'test-client-id',
          userPoolArn: 'arn:aws:cognito-idp:us-east-1:123456789:userpool/test',
          identityPoolId: 'us-east-1:test-identity-pool-id',
        },
        storage: {
          sessionsTableName: 'test-sessions',
          progressTableName: 'test-progress',
          audioBucketName: 'test-audio-bucket',
          audioBucketArn: 'arn:aws:s3:::test-audio-bucket',
        },
      },
    });
    template = Template.fromStack(stack);
  });

  test('has REST API Gateway', () => {
    template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
  });

  test('has 4 Lambda functions', () => {
    template.resourceCountIs('AWS::Lambda::Function', 4);
  });

  test('Lambda functions have correct runtime (Node.js 20)', () => {
    const lambdas = template.findResources('AWS::Lambda::Function');
    for (const [, resource] of Object.entries(lambdas)) {
      expect((resource as any).Properties.Runtime).toBe('nodejs20.x');
    }
  });

  test('API Gateway has Cognito authorizer', () => {
    template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
      Type: 'COGNITO_USER_POOLS',
    });
  });

  test('Lambda has Bedrock invoke policy', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'bedrock:InvokeModel',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('Lambda has Transcribe policy', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              'transcribe:StartTranscriptionJob',
              'transcribe:GetTranscriptionJob',
            ],
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('Lambda has Polly policy', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: 'polly:SynthesizeSpeech',
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });

  test('Lambda has DynamoDB policy', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              'dynamodb:GetItem',
              'dynamodb:PutItem',
              'dynamodb:UpdateItem',
              'dynamodb:Query',
            ],
            Effect: 'Allow',
          }),
        ]),
      },
    });
  });
});

// --- FrontendStack Tests ---
describe('FrontendStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new FrontendStack(app, 'TestFrontendStack', {
      auth: {
        userPoolId: 'test-pool-id',
        userPoolClientId: 'test-client-id',
        userPoolArn: 'arn:aws:cognito-idp:us-east-1:123456789:userpool/test',
        identityPoolId: 'us-east-1:test-identity-pool-id',
      },
      storage: {
        sessionsTableName: 'test-sessions',
        progressTableName: 'test-progress',
        audioBucketName: 'test-audio-bucket',
        audioBucketArn: 'arn:aws:s3:::test-audio-bucket',
      },
      apiUrl: 'https://test-api.execute-api.us-east-1.amazonaws.com/prod/',
      webSocketUrl: 'wss://test-ws.execute-api.us-east-1.amazonaws.com/production',
    });
    template = Template.fromStack(stack);
  });

  test('has Amplify App', () => {
    template.resourceCountIs('AWS::Amplify::App', 1);
  });

  test('has Amplify Branch', () => {
    template.resourceCountIs('AWS::Amplify::Branch', 1);
  });
});
