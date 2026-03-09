import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PollyClient, SynthesizeSpeechCommand, Engine, OutputFormat, VoiceId } from '@aws-sdk/client-polly';

const pollyClient = new PollyClient({});

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

function extractUserId(event: APIGatewayProxyEvent): string | null {
  return event.requestContext.authorizer?.claims?.sub ?? null;
}

function successResponse(body: Record<string, unknown>): APIGatewayProxyResult {
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function errorResponse(statusCode: number, error: string, message: string): APIGatewayProxyResult {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify({ error, message }) };
}

async function synthesizeSpeech(text: string): Promise<{ audioData: string; contentType: string }> {
  const command = new SynthesizeSpeechCommand({
    Text: text,
    OutputFormat: OutputFormat.MP3,
    VoiceId: VoiceId.Joanna,
    Engine: Engine.NEURAL,
  });

  const result = await pollyClient.send(command);

  if (!result.AudioStream) {
    throw new Error('Polly did not return an audio stream');
  }

  // Convert the audio stream to base64
  const chunks: Uint8Array[] = [];
  const stream = result.AudioStream as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const audioData = Buffer.from(combined).toString('base64');

  return {
    audioData,
    contentType: result.ContentType || 'audio/mpeg',
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Extract userId from Cognito authorizer
    const userId = extractUserId(event);
    if (!userId) {
      return errorResponse(401, 'Unauthorized', 'Token tidak valid');
    }

    // Parse request body
    let body: Record<string, unknown>;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch {
      return errorResponse(400, 'Bad Request', 'Request body harus berupa JSON yang valid');
    }

    const { text } = body as { text?: string };

    // Validate required field
    if (!text || typeof text !== 'string' || text.trim() === '') {
      return errorResponse(400, 'Bad Request', 'Missing required field: text');
    }

    // Synthesize speech via Amazon Polly
    const { audioData, contentType } = await synthesizeSpeech(text.trim());

    return successResponse({ audioData, contentType });
  } catch (err: unknown) {
    const error = err as { message?: string; name?: string };
    console.error('Speak handler error:', error);

    const message = error.message || 'Terjadi kesalahan internal';

    if (message.includes('Polly did not return')) {
      return errorResponse(500, 'Internal Server Error', 'Gagal menghasilkan audio. Silakan coba lagi.');
    }

    return errorResponse(500, 'Internal Server Error', 'Terjadi kesalahan internal');
  }
};
