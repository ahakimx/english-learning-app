import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { StorageStack } from '../lib/storage-stack';
import { ApiStack } from '../lib/api-stack';

// CDK assertion tests for the JD Targeting feature (task 15.4).
//
// These assertions verify the infrastructure contract added by tasks 15.1-15.3:
//   - Sessions table TTL is enabled on the `ttl` attribute (Requirement 11.3, 4.3)
//   - Chat Lambda exposes JD_RATE_LIMIT and JD_RETENTION_DAYS env vars (Requirement 11.6)
//   - A scheduled JdRetentionCleanup Lambda exists with a daily EventBridge rule
//     (Requirements 11.4, 11.5, 11.6)
//   - No resource updates target existing Session_Records as a side effect
//     of deploying this feature (Requirement 10.7)

// --- StorageStack: Sessions table TTL ---
describe('JD Targeting - StorageStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new StorageStack(app, 'TestJdStorageStack');
    template = Template.fromStack(stack);
  });

  // Requirements: 11.3, 4.3
  test('Sessions table has TTL enabled on the `ttl` attribute', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'EnglishLearningApp-Sessions',
      TimeToLiveSpecification: {
        AttributeName: 'ttl',
        Enabled: true,
      },
    });
  });

  // Requirement: 10.7 - deploying this feature must not migrate/update existing
  // Session records. No custom resources should touch the Sessions table.
  test('StorageStack contains no CloudFormation custom resources', () => {
    template.resourceCountIs('AWS::CloudFormation::CustomResource', 0);
  });
});

// --- ApiStack: Chat Lambda env vars, JdRetentionCleanup Lambda, EventBridge rule ---
describe('JD Targeting - ApiStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new ApiStack(app, 'TestJdApiStack', {
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

  // Requirements: 4.3, 11.6
  test('Chat Lambda env vars include JD_RATE_LIMIT and JD_RETENTION_DAYS', () => {
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      FunctionName: 'EnglishLearningApp-Chat',
      Environment: {
        Variables: Match.objectLike({
          JD_RATE_LIMIT: Match.anyValue(),
          JD_RETENTION_DAYS: Match.anyValue(),
        }),
      },
    }));
  });

  // Requirement: 11.4, 11.5, 11.6
  test('JdRetentionCleanup Lambda exists', () => {
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      FunctionName: 'EnglishLearningApp-JdRetentionCleanup',
    }));
  });

  // Requirement: 11.6 - retention Lambda is configurable via env var
  test('JdRetentionCleanup Lambda has JD_RETENTION_DAYS env var', () => {
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      FunctionName: 'EnglishLearningApp-JdRetentionCleanup',
      Environment: {
        Variables: Match.objectLike({
          JD_RETENTION_DAYS: Match.anyValue(),
        }),
      },
    }));
  });

  // Requirement: 11.4, 11.5 - daily schedule drives the retention cleanup
  test('EventBridge rule with rate(1 day) schedule exists', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'rate(1 day)',
    });
  });

  // Requirement: 10.7 - no resource updates target existing Session records.
  // The feature must not introduce any custom resources that backfill or
  // rewrite Session_Records during deployment.
  test('ApiStack contains no CloudFormation custom resources', () => {
    template.resourceCountIs('AWS::CloudFormation::CustomResource', 0);
  });

  test('ApiStack contains no Custom::AWS (AwsSdkCall) resources', () => {
    template.resourceCountIs('Custom::AWS', 0);
  });
});
