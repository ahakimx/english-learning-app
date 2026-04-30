import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { AuthStackOutputs } from './types';

export class AuthStack extends cdk.Stack {
  public readonly outputs: AuthStackOutputs;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Cognito User Pool with email sign-in and password policy
    const userPool = new cognito.UserPool(this, 'EnglishLearningUserPool', {
      userPoolName: 'EnglishLearningApp-UserPool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Cognito User Pool Client for SPA frontend (no client secret)
    const userPoolClient = userPool.addClient('EnglishLearningAppClient', {
      userPoolClientName: 'EnglishLearningApp-WebClient',
      generateSecret: false,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
    });

    // Cognito Identity Pool for S3 access (Amplify Storage)
    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: 'EnglishLearningApp-IdentityPool',
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    });

    // IAM role for authenticated users
    const authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity',
      ),
    });

    // S3 permission for authenticated users to upload/download audio files
    // Per-user isolation is enforced by Amplify Storage path config and Lambda validation
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
        resources: ['arn:aws:s3:::englishlearningapp-*/*'],
      }),
    );

    // Bedrock permission for authenticated users to connect directly to Nova Sonic
    // from the browser via the Bedrock SDK (frontend-direct architecture).
    // InvokeModelWithBidirectionalStream requires bedrock:InvokeModel per AWS docs.
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithBidirectionalStream',
        ],
        resources: ['*'],
      }),
    );

    // Attach role to Identity Pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    // Export outputs for other stacks
    this.outputs = {
      userPoolId: userPool.userPoolId,
      userPoolClientId: userPoolClient.userPoolClientId,
      userPoolArn: userPool.userPoolArn,
      identityPoolId: identityPool.ref,
    };

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'UserPoolArn', { value: userPool.userPoolArn });
    new cdk.CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });
  }
}
