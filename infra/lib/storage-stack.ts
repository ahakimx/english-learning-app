import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { StorageStackOutputs } from './types';

export class StorageStack extends cdk.Stack {
  public readonly outputs: StorageStackOutputs;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB table: EnglishLearningApp-Sessions
    const sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      tableName: 'EnglishLearningApp-Sessions',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    sessionsTable.addGlobalSecondaryIndex({
      indexName: 'sessionId-index',
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
    });

    // DynamoDB table: EnglishLearningApp-Progress
    const progressTable = new dynamodb.Table(this, 'ProgressTable', {
      tableName: 'EnglishLearningApp-Progress',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'moduleType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // S3 bucket for audio files
    const audioBucket = new s3.Bucket(this, 'AudioBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
    });

    // Allow Amazon Transcribe service to read audio files from the bucket
    audioBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('transcribe.amazonaws.com')],
        actions: ['s3:GetObject', 's3:ListBucket'],
        resources: [audioBucket.bucketArn, `${audioBucket.bucketArn}/*`],
      }),
    );

    this.outputs = {
      sessionsTableName: sessionsTable.tableName,
      progressTableName: progressTable.tableName,
      audioBucketName: audioBucket.bucketName,
      audioBucketArn: audioBucket.bucketArn,
    };
  }
}
