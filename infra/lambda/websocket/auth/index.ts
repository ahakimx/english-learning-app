// WebSocket Auth Lambda — validates Cognito JWT from query string
// Implements JWT validation using native Node.js crypto (no external JWT libraries)
// Environment variables: USER_POOL_ID, USER_POOL_CLIENT_ID

import type { APIGatewayProxyResult } from 'aws-lambda';
import * as crypto from 'crypto';
import * as https from 'https';

// --- Types ---

interface WebSocketConnectEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
  };
  queryStringParameters?: {
    token?: string;
  };
}

interface JwtHeader {
  alg: string;
  kid: string;
  typ?: string;
}

interface JwtPayload {
  sub: string;
  iss: string;
  aud?: string;
  client_id?: string;
  token_use: string;
  exp: number;
  iat: number;
  [key: string]: unknown;
}

interface JwksKey {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface JwksResponse {
  keys: JwksKey[];
}

// --- JWKS Cache ---

let jwksCache: JwksResponse | null = null;
let jwksCacheExpiry = 0;
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- Environment ---

const USER_POOL_ID = process.env.USER_POOL_ID ?? '';
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID ?? '';

function getRegionFromUserPoolId(userPoolId: string): string {
  // User Pool ID format: <region>_<id>
  const parts = userPoolId.split('_');
  if (parts.length < 2) {
    throw new Error(`Invalid User Pool ID format: ${userPoolId}`);
  }
  return parts[0];
}

// --- JWKS Fetching ---

function fetchJwks(jwksUrl: string): Promise<JwksResponse> {
  return new Promise((resolve, reject) => {
    const req = https.get(jwksUrl, (res) => {
      let data = '';
      res.on('data', (chunk: string) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data) as JwksResponse;
          resolve(parsed);
        } catch (err) {
          reject(new Error(`Failed to parse JWKS response: ${err}`));
        }
      });
    });
    req.on('error', (err) => {
      reject(new Error(`Failed to fetch JWKS: ${err.message}`));
    });
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('JWKS fetch timed out'));
    });
  });
}

async function getJwks(userPoolId: string): Promise<JwksResponse> {
  const now = Date.now();
  if (jwksCache && now < jwksCacheExpiry) {
    return jwksCache;
  }

  const region = getRegionFromUserPoolId(userPoolId);
  const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  const jwks = await fetchJwks(jwksUrl);

  jwksCache = jwks;
  jwksCacheExpiry = now + JWKS_CACHE_TTL_MS;

  return jwks;
}

// --- Base64URL Helpers ---

function base64UrlDecode(input: string): Buffer {
  // Replace URL-safe characters and add padding
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding === 2) {
    base64 += '==';
  } else if (padding === 3) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

// --- RSA Public Key Construction ---

function buildRsaPublicKey(jwk: JwksKey): crypto.KeyObject {
  const nBuffer = base64UrlDecode(jwk.n);
  const eBuffer = base64UrlDecode(jwk.e);

  // Build DER-encoded RSA public key
  // RSA public key ASN.1 structure:
  // SEQUENCE {
  //   SEQUENCE { OID rsaEncryption, NULL }
  //   BIT STRING { SEQUENCE { INTEGER n, INTEGER e } }
  // }

  const nBytes = encodeUnsignedInteger(nBuffer);
  const eBytes = encodeUnsignedInteger(eBuffer);

  // Inner SEQUENCE: n + e
  const rsaKeySequence = encodeSequence(Buffer.concat([nBytes, eBytes]));

  // BIT STRING wrapping the inner sequence
  const bitString = encodeBitString(rsaKeySequence);

  // Algorithm identifier: rsaEncryption OID + NULL
  const rsaOid = Buffer.from([
    0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // OID 1.2.840.113549.1.1.1
    0x05, 0x00, // NULL
  ]);
  const algorithmIdentifier = encodeSequence(rsaOid);

  // Outer SEQUENCE: algorithmIdentifier + bitString
  const publicKeyInfo = encodeSequence(Buffer.concat([algorithmIdentifier, bitString]));

  // Convert to PEM
  const pem = `-----BEGIN PUBLIC KEY-----\n${publicKeyInfo.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;

  return crypto.createPublicKey(pem);
}

function encodeLength(length: number): Buffer {
  if (length < 0x80) {
    return Buffer.from([length]);
  }
  const bytes: number[] = [];
  let temp = length;
  while (temp > 0) {
    bytes.unshift(temp & 0xff);
    temp >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function encodeSequence(content: Buffer): Buffer {
  const tag = Buffer.from([0x30]); // SEQUENCE tag
  const length = encodeLength(content.length);
  return Buffer.concat([tag, length, content]);
}

function encodeUnsignedInteger(value: Buffer): Buffer {
  const tag = Buffer.from([0x02]); // INTEGER tag
  // If high bit is set, prepend a 0x00 byte to keep it positive
  let content = value;
  if (value[0] & 0x80) {
    content = Buffer.concat([Buffer.from([0x00]), value]);
  }
  const length = encodeLength(content.length);
  return Buffer.concat([tag, length, content]);
}

function encodeBitString(content: Buffer): Buffer {
  const tag = Buffer.from([0x03]); // BIT STRING tag
  // Prepend 0x00 (no unused bits)
  const wrapped = Buffer.concat([Buffer.from([0x00]), content]);
  const length = encodeLength(wrapped.length);
  return Buffer.concat([tag, length, wrapped]);
}

// --- JWT Verification ---

function decodeJwt(token: string): { header: JwtHeader; payload: JwtPayload; signatureInput: string; signature: Buffer } {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format: expected 3 parts');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as JwtHeader;
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as JwtPayload;
  const signature = base64UrlDecode(signatureB64);
  const signatureInput = `${headerB64}.${payloadB64}`;

  return { header, payload, signatureInput, signature };
}

function verifySignature(signatureInput: string, signature: Buffer, publicKey: crypto.KeyObject, algorithm: string): boolean {
  // Map JWT algorithm to Node.js algorithm
  const algoMap: Record<string, string> = {
    RS256: 'RSA-SHA256',
    RS384: 'RSA-SHA384',
    RS512: 'RSA-SHA512',
  };

  const nodeAlgo = algoMap[algorithm];
  if (!nodeAlgo) {
    throw new Error(`Unsupported JWT algorithm: ${algorithm}`);
  }

  const verifier = crypto.createVerify(nodeAlgo);
  verifier.update(signatureInput);
  return verifier.verify(publicKey, signature);
}

export async function validateJwt(token: string, userPoolId: string, clientId: string): Promise<JwtPayload> {
  // 1. Decode JWT
  const { header, payload, signatureInput, signature } = decodeJwt(token);

  // 2. Validate algorithm
  if (!header.alg || !header.alg.startsWith('RS')) {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  // 3. Fetch JWKS and find matching key
  const jwks = await getJwks(userPoolId);
  const matchingKey = jwks.keys.find((key) => key.kid === header.kid);
  if (!matchingKey) {
    throw new Error(`No matching key found for kid: ${header.kid}`);
  }

  // 4. Build public key and verify signature
  const publicKey = buildRsaPublicKey(matchingKey);
  const isValid = verifySignature(signatureInput, signature, publicKey, header.alg);
  if (!isValid) {
    throw new Error('JWT signature verification failed');
  }

  // 5. Validate expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('JWT token has expired');
  }

  // 6. Validate issuer
  const region = getRegionFromUserPoolId(userPoolId);
  const expectedIssuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  if (payload.iss !== expectedIssuer) {
    throw new Error(`Invalid issuer: expected ${expectedIssuer}, got ${payload.iss}`);
  }

  // 7. Validate token_use (should be 'id' or 'access')
  if (payload.token_use !== 'id' && payload.token_use !== 'access') {
    throw new Error(`Invalid token_use: expected 'id' or 'access', got ${payload.token_use}`);
  }

  // 8. Validate audience/client_id
  // For id tokens, 'aud' should match the client ID
  // For access tokens, 'client_id' should match
  if (payload.token_use === 'id') {
    if (payload.aud !== clientId) {
      throw new Error(`Invalid audience: expected ${clientId}, got ${payload.aud}`);
    }
  } else if (payload.token_use === 'access') {
    if (payload.client_id !== clientId) {
      throw new Error(`Invalid client_id: expected ${clientId}, got ${payload.client_id}`);
    }
  }

  // 9. Validate 'sub' claim exists
  if (!payload.sub) {
    throw new Error('JWT missing required claim: sub');
  }

  return payload;
}

// --- Lambda Handler ---

export const handler = async (event: WebSocketConnectEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;
  const token = event.queryStringParameters?.token;

  console.log(`Auth request for connection ${connectionId}`);

  // Check for missing token
  if (!token) {
    console.log(`Connection ${connectionId} rejected: missing token`);
    return { statusCode: 401, body: 'Unauthorized: missing token' };
  }

  // Check for missing environment variables
  if (!USER_POOL_ID || !USER_POOL_CLIENT_ID) {
    console.error('Missing environment variables: USER_POOL_ID or USER_POOL_CLIENT_ID');
    return { statusCode: 500, body: 'Internal server error: auth configuration missing' };
  }

  try {
    // Validate JWT token
    const claims = await validateJwt(token, USER_POOL_ID, USER_POOL_CLIENT_ID);
    const userId = claims.sub;

    console.log(`Connection ${connectionId} authorized for user ${userId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Connected',
        userId,
        connectionId,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(`Connection ${connectionId} rejected: ${message}`);

    return { statusCode: 401, body: `Unauthorized: ${message}` };
  }
};
