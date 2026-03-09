import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
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

    // Export outputs for other stacks
    this.outputs = {
      userPoolId: userPool.userPoolId,
      userPoolClientId: userPoolClient.userPoolClientId,
      userPoolArn: userPool.userPoolArn,
    };

    // CloudFormation outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'UserPoolArn', { value: userPool.userPoolArn });
  }
}
