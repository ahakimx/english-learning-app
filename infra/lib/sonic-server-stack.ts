import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * CDK stack that deploys the Nova Sonic proxy server on an EC2 t3.micro instance.
 *
 * ~$8/month (or free tier eligible for 1 year).
 * Always on, no cold start.
 *
 * The instance runs the Express + Socket.IO server via Docker.
 * UserData script installs Docker, pulls the image, and starts the container.
 *
 * Deployment workflow:
 *   1. `cdk deploy` creates the EC2 instance with security group and IAM role.
 *   2. SSH into the instance or use the UserData to deploy the server code.
 *   3. Frontend connects to http://<public-ip>:3001
 */
export class SonicServerStack extends cdk.Stack {
  /** The public URL of the proxy server */
  public readonly serviceUrl: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------
    // VPC — use default VPC for simplicity
    // ---------------------------------------------------------------
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    // ---------------------------------------------------------------
    // Security Group — allow inbound on port 3001 and SSH
    // ---------------------------------------------------------------
    const securityGroup = new ec2.SecurityGroup(this, 'SonicServerSG', {
      vpc,
      description: 'Nova Sonic proxy server security group',
      allowAllOutbound: true,
    });

    // Allow Socket.IO connections from anywhere (port 3001)
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3001),
      'Allow Socket.IO connections',
    );

    // Allow HTTPS (for future ALB/Nginx setup)
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS',
    );

    // Allow SSH for debugging
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH',
    );

    // ---------------------------------------------------------------
    // IAM Role — Bedrock permissions for the proxy server
    // ---------------------------------------------------------------
    const role = new iam.Role(this, 'SonicServerRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'EC2 role for Nova Sonic proxy server',
      managedPolicies: [
        // SSM for remote management (optional, no SSH needed)
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    role.addToPolicy(
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
    // EC2 Instance — t3.micro with Amazon Linux 2023
    // ---------------------------------------------------------------
    const instance = new ec2.Instance(this, 'SonicServerInstance', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      securityGroup,
      role,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      associatePublicIpAddress: true,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(20, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
    });

    // ---------------------------------------------------------------
    // UserData — install Node.js, clone/setup server, start with systemd
    // ---------------------------------------------------------------
    instance.addUserData(
      '#!/bin/bash',
      'set -e',
      '',
      '# Install Node.js 20',
      'curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -',
      'yum install -y nodejs git',
      '',
      '# Create app directory',
      'mkdir -p /opt/sonic-server',
      'cd /opt/sonic-server',
      '',
      '# Create package.json',
      'cat > package.json << \'PKGJSON\'',
      JSON.stringify({
        name: 'nova-sonic-proxy',
        version: '1.0.0',
        type: 'module',
        scripts: {
          build: 'tsc',
          start: 'node dist/server.js',
        },
        dependencies: {
          '@aws-sdk/client-bedrock-runtime': '^3.785',
          '@aws-sdk/credential-provider-node': '^3.785',
          '@smithy/node-http-handler': '^4.0.4',
          '@smithy/types': '^4.1.0',
          cors: '^2.8.5',
          dotenv: '^16.3.1',
          express: '^4.21.2',
          'socket.io': '^4.8.1',
        },
        devDependencies: {
          '@types/cors': '^2.8.17',
          '@types/express': '^5.0.0',
          '@types/node': '^22.13.9',
          typescript: '~5.6.2',
        },
      }, null, 2),
      'PKGJSON',
      '',
      '# Create tsconfig.json',
      'cat > tsconfig.json << \'TSCONFIG\'',
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          lib: ['ES2022'],
          outDir: 'dist',
          rootDir: 'src',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          resolveJsonModule: true,
          declaration: true,
          sourceMap: true,
        },
        include: ['src'],
        exclude: ['node_modules', 'dist'],
      }, null, 2),
      'TSCONFIG',
      '',
      '# Install dependencies',
      'npm install',
      '',
      '# Source files will be deployed via scp/rsync or git pull',
      '# For now, create a placeholder that will be replaced',
      'mkdir -p src',
      'echo "console.log(\'Placeholder — deploy server code\');" > src/server.ts',
      '',
      '# Create systemd service',
      'cat > /etc/systemd/system/sonic-server.service << \'SYSTEMD\'',
      '[Unit]',
      'Description=Nova Sonic Proxy Server',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'User=root',
      'WorkingDirectory=/opt/sonic-server',
      'ExecStart=/usr/bin/node dist/server.js',
      'Restart=always',
      'RestartSec=5',
      'Environment=AWS_REGION=us-east-1',
      'Environment=BEDROCK_MODEL_ID=amazon.nova-2-sonic-v1:0',
      'Environment=PORT=3001',
      '',
      '[Install]',
      'WantedBy=multi-user.target',
      'SYSTEMD',
      '',
      'systemctl daemon-reload',
      'systemctl enable sonic-server',
      '',
      '# Signal that setup is complete',
      'echo "Nova Sonic proxy server setup complete" > /opt/sonic-server/setup-complete.txt',
    );

    // ---------------------------------------------------------------
    // Elastic IP — so the IP doesn't change on restart
    // ---------------------------------------------------------------
    const eip = new ec2.CfnEIP(this, 'SonicServerEIP', {
      instanceId: instance.instanceId,
    });

    // ---------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------
    this.serviceUrl = `http://${eip.attrPublicIp}:3001`;

    new cdk.CfnOutput(this, 'SonicServerUrl', {
      value: this.serviceUrl,
      description: 'Nova Sonic proxy server URL',
    });

    new cdk.CfnOutput(this, 'SonicServerPublicIp', {
      value: eip.attrPublicIp,
      description: 'EC2 public IP address',
    });

    new cdk.CfnOutput(this, 'InstanceId', {
      value: instance.instanceId,
      description: 'EC2 instance ID (use for SSM Session Manager)',
    });
  }
}
