import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apprunner from 'aws-cdk-lib/aws-apprunner';
import { Construct } from 'constructs';

/**
 * CDK stack that deploys the Nova Sonic proxy server (Express + Socket.IO)
 * to AWS App Runner backed by an ECR image repository.
 *
 * Deployment workflow:
 *   1. `cdk deploy` creates the ECR repo, IAM roles, and App Runner service.
 *   2. Push the Docker image to the ECR repo (manually or via CI/CD).
 *   3. App Runner pulls the image and runs the container.
 *
 * Note: Socket.IO falls back to HTTP long-polling on App Runner because
 * sticky sessions are not natively supported. The server CORS is set to
 * allow all origins so the Amplify-hosted frontend can connect.
 */
export class AppRunnerStack extends cdk.Stack {
  /** The HTTPS URL of the App Runner service (e.g. https://xxx.us-east-1.awsapprunner.com) */
  public readonly serviceUrl: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------
    // ECR Repository for the server Docker image
    // ---------------------------------------------------------------
    const ecrRepo = new ecr.Repository(this, 'NovaSonicProxyRepo', {
      repositoryName: 'nova-sonic-proxy',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [
        {
          maxImageCount: 5,
          description: 'Keep only the 5 most recent images',
        },
      ],
    });

    // ---------------------------------------------------------------
    // IAM — ECR Access Role (App Runner pulls images from ECR)
    // ---------------------------------------------------------------
    const accessRole = new iam.Role(this, 'AppRunnerEcrAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      description: 'Allows App Runner to pull images from ECR',
    });

    ecrRepo.grantPull(accessRole);

    // ---------------------------------------------------------------
    // IAM — Instance Role (runtime permissions for the container)
    // ---------------------------------------------------------------
    const instanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: 'Runtime role for the Nova Sonic proxy container',
    });

    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithBidirectionalStream',
        ],
        resources: ['*'],
      }),
    );

    // ---------------------------------------------------------------
    // App Runner Service (L1 CfnService)
    // ---------------------------------------------------------------
    const service = new apprunner.CfnService(this, 'NovaSonicProxyService', {
      serviceName: 'nova-sonic-proxy',

      sourceConfiguration: {
        authenticationConfiguration: {
          accessRoleArn: accessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: `${ecrRepo.repositoryUri}:latest`,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: '3001',
            runtimeEnvironmentVariables: [
              { name: 'AWS_REGION', value: 'us-east-1' },
              { name: 'BEDROCK_MODEL_ID', value: 'amazon.nova-2-sonic-v1:0' },
            ],
          },
        },
        autoDeploymentsEnabled: true,
      },

      instanceConfiguration: {
        cpu: '1 vCPU',
        memory: '2 GB',
        instanceRoleArn: instanceRole.roleArn,
      },

      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/health',
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },

      autoScalingConfigurationArn: undefined, // will create below
    });

    // ---------------------------------------------------------------
    // Auto-scaling configuration: min 1, max 5 instances
    // ---------------------------------------------------------------
    const autoScaling = new apprunner.CfnAutoScalingConfiguration(this, 'NovaSonicAutoScaling', {
      autoScalingConfigurationName: 'nova-sonic-proxy-scaling',
      minSize: 1,
      maxSize: 5,
      maxConcurrency: 50,
    });

    service.autoScalingConfigurationArn = autoScaling.attrAutoScalingConfigurationArn;
    service.addDependency(autoScaling);

    // ---------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------
    this.serviceUrl = `https://${service.attrServiceUrl}`;

    new cdk.CfnOutput(this, 'AppRunnerServiceUrl', {
      value: this.serviceUrl,
      description: 'Nova Sonic proxy server URL (App Runner)',
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: ecrRepo.repositoryUri,
      description: 'ECR repository URI — push Docker image here',
    });

    new cdk.CfnOutput(this, 'EcrRepositoryName', {
      value: ecrRepo.repositoryName,
      description: 'ECR repository name',
    });
  }
}
