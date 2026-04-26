import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';
import { WebSocketStackProps } from './types';

interface WebSocketStackCdkProps extends cdk.StackProps {
  wsProps: WebSocketStackProps;
}

export class WebSocketStack extends cdk.Stack {
  public readonly webSocketUrl: string;

  constructor(scope: Construct, id: string, props: WebSocketStackCdkProps) {
    super(scope, id, props);

    const { auth, storage } = props.wsProps;

    // -------------------------------------------------------
    // WebSocket API Gateway (API Gateway v2)
    // -------------------------------------------------------
    const webSocketApi = new apigatewayv2.CfnApi(this, 'NovaSonicWebSocketApi', {
      name: 'EnglishLearningApp-WebSocket',
      protocolType: 'WEBSOCKET',
      routeSelectionExpression: '$request.body.type',
      description: 'WebSocket API for Nova Sonic real-time speaking sessions',
    });

    // -------------------------------------------------------
    // Lambda: Auth ($connect route) — validates Cognito JWT
    // -------------------------------------------------------
    const authLambda = new NodejsFunction(this, 'WebSocketAuthHandler', {
      functionName: 'EnglishLearningApp-WS-Auth',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'websocket', 'auth', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        USER_POOL_ID: auth.userPoolId,
        USER_POOL_CLIENT_ID: auth.userPoolClientId,
      },
    });

    // -------------------------------------------------------
    // Lambda: NovaSonic (message route) — handles bidirectional streaming
    // -------------------------------------------------------
    const novaSonicLambda = new NodejsFunction(this, 'NovaSonicHandler', {
      functionName: 'EnglishLearningApp-WS-NovaSonic',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'websocket', 'nova-sonic', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(480),
      memorySize: 512,
      environment: {
        SESSIONS_TABLE_NAME: storage.sessionsTableName,
        BEDROCK_MODEL_ID: 'amazon.nova-2-sonic-v1:0',
        HAIKU_MODEL_ID: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      },
    });

    // -------------------------------------------------------
    // Lambda: Cleanup ($disconnect route) — session cleanup
    // -------------------------------------------------------
    const cleanupLambda = new NodejsFunction(this, 'WebSocketCleanupHandler', {
      functionName: 'EnglishLearningApp-WS-Cleanup',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'websocket', 'cleanup', 'index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 128,
      environment: {
        SESSIONS_TABLE_NAME: storage.sessionsTableName,
      },
    });

    // -------------------------------------------------------
    // IAM Permissions
    // -------------------------------------------------------

    // NovaSonic Lambda: Bedrock permissions
    novaSonicLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModelWithBidirectionalStream',
        'bedrock:InvokeModel',
      ],
      resources: ['*'],
    }));

    // NovaSonic Lambda: DynamoDB CRUD
    novaSonicLambda.addToRolePolicy(new iam.PolicyStatement({
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

    // Cleanup Lambda: DynamoDB CRUD
    cleanupLambda.addToRolePolicy(new iam.PolicyStatement({
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

    // -------------------------------------------------------
    // API Gateway Integrations
    // -------------------------------------------------------

    // Auth Lambda integration for $connect
    const authIntegration = new apigatewayv2.CfnIntegration(this, 'AuthIntegration', {
      apiId: webSocketApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${authLambda.functionArn}/invocations`,
    });

    // NovaSonic Lambda integration for message route
    const novaSonicIntegration = new apigatewayv2.CfnIntegration(this, 'NovaSonicIntegration', {
      apiId: webSocketApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${novaSonicLambda.functionArn}/invocations`,
    });

    // Cleanup Lambda integration for $disconnect
    const cleanupIntegration = new apigatewayv2.CfnIntegration(this, 'CleanupIntegration', {
      apiId: webSocketApi.ref,
      integrationType: 'AWS_PROXY',
      integrationUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${cleanupLambda.functionArn}/invocations`,
    });

    // -------------------------------------------------------
    // Routes
    // -------------------------------------------------------

    // $connect route
    const connectRoute = new apigatewayv2.CfnRoute(this, 'ConnectRoute', {
      apiId: webSocketApi.ref,
      routeKey: '$connect',
      authorizationType: 'NONE',
      target: `integrations/${authIntegration.ref}`,
    });

    // $disconnect route
    const disconnectRoute = new apigatewayv2.CfnRoute(this, 'DisconnectRoute', {
      apiId: webSocketApi.ref,
      routeKey: '$disconnect',
      authorizationType: 'NONE',
      target: `integrations/${cleanupIntegration.ref}`,
    });

    // message route (custom route based on routeSelectionExpression)
    const messageRoute = new apigatewayv2.CfnRoute(this, 'MessageRoute', {
      apiId: webSocketApi.ref,
      routeKey: 'message',
      authorizationType: 'NONE',
      target: `integrations/${novaSonicIntegration.ref}`,
    });

    // $default route — fallback to NovaSonic Lambda for unmatched routes
    const defaultRoute = new apigatewayv2.CfnRoute(this, 'DefaultRoute', {
      apiId: webSocketApi.ref,
      routeKey: '$default',
      authorizationType: 'NONE',
      target: `integrations/${novaSonicIntegration.ref}`,
    });

    // -------------------------------------------------------
    // Stage: production with auto-deploy
    // -------------------------------------------------------
    const stage = new apigatewayv2.CfnStage(this, 'ProductionStage', {
      apiId: webSocketApi.ref,
      stageName: 'production',
      autoDeploy: true,
      description: 'Production stage for WebSocket API',
    });

    // Ensure stage is created after all routes
    stage.addDependency(connectRoute);
    stage.addDependency(disconnectRoute);
    stage.addDependency(messageRoute);
    stage.addDependency(defaultRoute);

    // -------------------------------------------------------
    // Lambda invoke permissions for API Gateway
    // -------------------------------------------------------
    authLambda.addPermission('AllowApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*`,
    });

    novaSonicLambda.addPermission('AllowApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*`,
    });

    cleanupLambda.addPermission('AllowApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/*`,
    });

    // -------------------------------------------------------
    // execute-api:ManageConnections — for sending messages back to clients
    // -------------------------------------------------------
    const manageConnectionsPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.ref}/production/POST/@connections/*`,
      ],
    });

    novaSonicLambda.addToRolePolicy(manageConnectionsPolicy);
    cleanupLambda.addToRolePolicy(manageConnectionsPolicy);

    // Set WEBSOCKET_ENDPOINT env var now that we have the API ID
    const websocketEndpoint = `https://${webSocketApi.ref}.execute-api.${this.region}.amazonaws.com/production`;

    // Add the endpoint as environment variable to NovaSonic Lambda
    // (CfnFunction doesn't support addEnvironment, so we use an override)
    const novaSonicCfnFunction = novaSonicLambda.node.defaultChild as lambda.CfnFunction;
    novaSonicCfnFunction.addPropertyOverride(
      'Environment.Variables.WEBSOCKET_ENDPOINT',
      websocketEndpoint,
    );

    // Also add to Cleanup Lambda for postToConnection capability
    const cleanupCfnFunction = cleanupLambda.node.defaultChild as lambda.CfnFunction;
    cleanupCfnFunction.addPropertyOverride(
      'Environment.Variables.WEBSOCKET_ENDPOINT',
      websocketEndpoint,
    );

    // -------------------------------------------------------
    // Outputs
    // -------------------------------------------------------
    this.webSocketUrl = `wss://${webSocketApi.ref}.execute-api.${this.region}.amazonaws.com/production`;

    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: this.webSocketUrl,
      description: 'WebSocket API URL for Nova Sonic real-time speaking sessions',
    });

    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: webSocketApi.ref,
      description: 'WebSocket API Gateway ID',
    });
  }
}
