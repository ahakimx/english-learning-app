import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';
import { ApiStackProps } from './types';

interface ApiStackCdkProps extends cdk.StackProps {
  apiProps: ApiStackProps;
}

export class ApiStack extends cdk.Stack {
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ApiStackCdkProps) {
    super(scope, id, props);

    const { auth, storage } = props.apiProps;

    // Import Cognito User Pool for authorizer
    const userPool = cognito.UserPool.fromUserPoolArn(this, 'ImportedUserPool', auth.userPoolArn);

    // REST API Gateway with CORS
    const api = new apigateway.RestApi(this, 'EnglishLearningApi', {
      restApiName: 'EnglishLearningApp-API',
      description: 'English Learning App REST API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'EnglishLearningApp-Authorizer',
    });

    const authMethodOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // --- Lambda: /chat ---
    const chatHandler = new NodejsFunction(this, 'ChatHandler', {
      functionName: 'EnglishLearningApp-Chat',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'chat', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        SESSIONS_TABLE_NAME: storage.sessionsTableName,
        PROGRESS_TABLE_NAME: storage.progressTableName,
        BEDROCK_TEXT_MODEL_ID: process.env.BEDROCK_TEXT_MODEL_ID ?? 'amazon.nova-pro-v1:0',
        // JD targeting: per-user daily rate limit for analyze_job_description (stage-configurable).
        JD_RATE_LIMIT: process.env.JD_RATE_LIMIT ?? '5',
        // JD targeting: retention window (days) after which jdContext is removed from Session_Records.
        JD_RETENTION_DAYS: process.env.JD_RETENTION_DAYS ?? '30',
      },
    });

    chatHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: ['*'],
    }));
    chatHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${storage.sessionsTableName}`,
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${storage.sessionsTableName}/index/*`,
      ],
    }));

    // --- Lambda: JD retention cleanup (scheduled) ---
    // Runs daily to scan Session_Records for targeted-mode sessions whose jdContext
    // has exceeded JD_RETENTION_DAYS and removes the jdContext attribute.
    const jdRetentionCleanupHandler = new NodejsFunction(this, 'JdRetentionCleanupHandler', {
      functionName: 'EnglishLearningApp-JdRetentionCleanup',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'chat', 'jdRetentionCleanup', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        SESSIONS_TABLE_NAME: storage.sessionsTableName,
        JD_RETENTION_DAYS: process.env.JD_RETENTION_DAYS ?? '30',
      },
    });

    jdRetentionCleanupHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:Scan', 'dynamodb:UpdateItem'],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${storage.sessionsTableName}`,
      ],
    }));

    new events.Rule(this, 'JdRetentionCleanupSchedule', {
      ruleName: 'EnglishLearningApp-JdRetentionCleanupSchedule',
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      targets: [new targets.LambdaFunction(jdRetentionCleanupHandler)],
    });

    // --- Lambda: /transcribe ---
    const transcribeHandler = new NodejsFunction(this, 'TranscribeHandler', {
      functionName: 'EnglishLearningApp-Transcribe',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'transcribe', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      environment: {
        AUDIO_BUCKET_NAME: storage.audioBucketName,
      },
    });

    transcribeHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'transcribe:StartTranscriptionJob',
        'transcribe:GetTranscriptionJob',
      ],
      resources: ['*'],
    }));
    transcribeHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject', 's3:HeadObject'],
      resources: [`${storage.audioBucketArn}/*`],
    }));
    transcribeHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:ListBucket'],
      resources: [storage.audioBucketArn],
    }));

    // --- Lambda: /speak ---
    const speakHandler = new NodejsFunction(this, 'SpeakHandler', {
      functionName: 'EnglishLearningApp-Speak',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'speak', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {},
    });

    speakHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['polly:SynthesizeSpeech'],
      resources: ['*'],
    }));

    // --- Lambda: /progress ---
    const progressHandler = new NodejsFunction(this, 'ProgressHandler', {
      functionName: 'EnglishLearningApp-Progress',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'progress', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        PROGRESS_TABLE_NAME: storage.progressTableName,
      },
    });

    progressHandler.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
      ],
      resources: [
        `arn:aws:dynamodb:${this.region}:${this.account}:table/${storage.progressTableName}`,
      ],
    }));

    // --- API Gateway Routes ---
    const chatResource = api.root.addResource('chat');
    chatResource.addMethod('POST', new apigateway.LambdaIntegration(chatHandler), authMethodOptions);

    const transcribeResource = api.root.addResource('transcribe');
    transcribeResource.addMethod('POST', new apigateway.LambdaIntegration(transcribeHandler), authMethodOptions);

    const speakResource = api.root.addResource('speak');
    speakResource.addMethod('POST', new apigateway.LambdaIntegration(speakHandler), authMethodOptions);

    const progressResource = api.root.addResource('progress');
    progressResource.addMethod('GET', new apigateway.LambdaIntegration(progressHandler), authMethodOptions);
    progressResource.addMethod('POST', new apigateway.LambdaIntegration(progressHandler), authMethodOptions);

    // --- Outputs ---
    this.apiUrl = api.url;

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'English Learning App API URL',
    });
  }
}
