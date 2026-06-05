import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3assets from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';
import * as path from 'path';

/**
 * CDK stack that deploys the Nova Sonic proxy server on an EC2 t3.micro instance.
 *
 * ~$8/month (or free tier eligible for 1 year). Always on, no cold start.
 *
 * Unlike the previous revision, the server is now FULLY self-provisioning: the
 * `server/` source is bundled as an S3 asset and the UserData script downloads
 * it, builds it, starts it under systemd, and terminates TLS with nginx +
 * Let's Encrypt. A replaced instance therefore comes up production-ready with
 * no manual deploy step (previously the UserData only left a placeholder, so a
 * replacement instance served nothing and had no HTTPS).
 *
 * Deployment workflow:
 *   1. `cdk deploy` bundles `server/`, creates the instance, security group,
 *      IAM role, and Elastic IP.
 *   2. On first boot the UserData deploys + builds the code, configures the
 *      systemd service, installs nginx, and requests a TLS certificate for the
 *      configured domain (which must already resolve to the instance's EIP).
 *   3. Frontend connects to https://<domain> (e.g. https://sonic.arkoda.cloud).
 *
 * Configurable via environment variables at synth time:
 *   - SONIC_DOMAIN           (default: sonic.arkoda.cloud)
 *   - CERTBOT_EMAIL          (default: admin@arkoda.cloud)
 *   - BEDROCK_SONIC_MODEL_ID (default: amazon.nova-2-sonic-v1:0)
 */
export class SonicServerStack extends cdk.Stack {
  /** The public URL of the proxy server */
  public readonly serviceUrl: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ---------------------------------------------------------------
    // Configuration (resolved at synth time; env-overridable)
    // ---------------------------------------------------------------
    const domain = process.env.SONIC_DOMAIN ?? 'sonic.arkoda.cloud';
    const certbotEmail = process.env.CERTBOT_EMAIL ?? 'admin@arkoda.cloud';
    const sonicModelId = process.env.BEDROCK_SONIC_MODEL_ID ?? 'amazon.nova-2-sonic-v1:0';

    // ---------------------------------------------------------------
    // VPC — use default VPC for simplicity
    // ---------------------------------------------------------------
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });

    // ---------------------------------------------------------------
    // Security Group — HTTP(80) + HTTPS(443) for nginx/ACME, 3001 for the
    // raw Socket.IO port (local/debug), and SSH(22).
    // ---------------------------------------------------------------
    const securityGroup = new ec2.SecurityGroup(this, 'SonicServerSG', {
      vpc,
      description: 'Nova Sonic proxy server security group',
      allowAllOutbound: true,
    });

    // HTTP — required for the certbot HTTP-01 challenge and the ->HTTPS redirect.
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP (ACME challenge + redirect to HTTPS)',
    );

    // HTTPS — nginx TLS termination for the Socket.IO traffic.
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS',
    );

    // Raw Socket.IO port (used locally / for debugging; production goes via 443).
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(3001),
      'Allow Socket.IO connections (direct)',
    );

    // SSH for debugging.
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      'Allow SSH',
    );

    // ---------------------------------------------------------------
    // IAM Role — Bedrock permissions + SSM for remote management
    // ---------------------------------------------------------------
    const role = new iam.Role(this, 'SonicServerRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      description: 'EC2 role for Nova Sonic proxy server',
      managedPolicies: [
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
    // Server source bundle — packaged from the local `server/` directory and
    // uploaded to the CDK assets bucket. The instance downloads + builds this
    // on first boot, so the deployed code always matches the committed source.
    // ---------------------------------------------------------------
    const serverAsset = new s3assets.Asset(this, 'SonicServerSource', {
      path: path.join(__dirname, '..', '..', 'server'),
      exclude: ['node_modules', 'dist', '.env', '*.log', '_*', '.git'],
    });
    serverAsset.grantRead(role);

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
    // UserData — deploy + build code, run under systemd, terminate TLS
    // with nginx + Let's Encrypt. Self-contained and idempotent-friendly.
    // ---------------------------------------------------------------
    const userData = `set -euxo pipefail

# --- Install runtime + build + web tooling ------------------------------
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs unzip nginx certbot python3-certbot-nginx

# --- Deploy the server source bundle ------------------------------------
mkdir -p /opt/sonic-server
aws s3 cp ${serverAsset.s3ObjectUrl} /tmp/sonic-server.zip
rm -rf /opt/sonic-server/src /opt/sonic-server/dist
unzip -o /tmp/sonic-server.zip -d /opt/sonic-server
cd /opt/sonic-server

# --- Build (install dev deps, compile TS, then keep prod deps) ----------
npm install
npx tsc
npm prune --production || true

# --- systemd service (note: BEDROCK_SONIC_MODEL_ID resolved at synth) ---
cat > /etc/systemd/system/sonic-server.service << 'SYSTEMD'
[Unit]
Description=Nova Sonic Proxy Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/sonic-server
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
Environment=AWS_REGION=${this.region}
Environment=BEDROCK_SONIC_MODEL_ID=${sonicModelId}
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
systemctl enable --now sonic-server

# --- nginx reverse proxy (HTTP first; certbot adds TLS + redirect) ------
cat > /etc/nginx/conf.d/sonic.conf << 'NGINXCONF'
server {
    listen 80;
    server_name ${domain};
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
NGINXCONF

nginx -t
systemctl enable --now nginx
systemctl reload nginx

# --- TLS via Let's Encrypt ----------------------------------------------
# Wait until DNS for the domain resolves to THIS instance's public IP before
# requesting a certificate. The Elastic IP association can lag first boot, so
# we poll metadata (IMDSv2) and the DNS A record. certbot failures are tolerated
# so the instance still serves over HTTP if the cert cannot be issued yet
# (e.g. DNS not propagated or Let's Encrypt rate limit) — re-run setup later.
set +e
IMDS_TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 600")
for attempt in $(seq 1 30); do
  MYIP=$(curl -s -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
  DNSIP=$(getent hosts ${domain} | awk '{ print $1; exit }')
  echo "DNS wait attempt $attempt: myip=$MYIP dnsip=$DNSIP"
  if [ -n "$MYIP" ] && [ "$MYIP" = "$DNSIP" ]; then
    echo "DNS matches instance IP; requesting certificate"
    certbot --nginx -d ${domain} --non-interactive --agree-tos --email ${certbotEmail} --redirect --keep-until-expiring
    break
  fi
  sleep 10
done
set -e

echo "Nova Sonic proxy server setup complete" > /opt/sonic-server/setup-complete.txt
`;

    instance.addUserData(userData);

    // ---------------------------------------------------------------
    // Elastic IP — stable address so DNS (and the issued cert) stay valid.
    // ---------------------------------------------------------------
    const eip = new ec2.CfnEIP(this, 'SonicServerEIP', {
      instanceId: instance.instanceId,
    });

    // ---------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------
    this.serviceUrl = `https://${domain}`;

    new cdk.CfnOutput(this, 'SonicServerUrl', {
      value: this.serviceUrl,
      description: 'Nova Sonic proxy server URL (HTTPS via nginx)',
    });

    new cdk.CfnOutput(this, 'SonicServerPublicIp', {
      value: eip.attrPublicIp,
      description: 'EC2 public IP address (point the domain A record here)',
    });

    new cdk.CfnOutput(this, 'SonicServerDomain', {
      value: domain,
      description: 'Domain served over HTTPS by the proxy',
    });

    new cdk.CfnOutput(this, 'InstanceId', {
      value: instance.instanceId,
      description: 'EC2 instance ID (use for SSM Session Manager)',
    });
  }
}
