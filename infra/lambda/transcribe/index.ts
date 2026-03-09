import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  TranscriptionJobStatus,
} from '@aws-sdk/client-transcribe';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const transcribeClient = new TranscribeClient({});
const s3Client = new S3Client({});

const AUDIO_BUCKET_NAME = process.env.AUDIO_BUCKET_NAME || '';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

const SUPPORTED_FORMATS = ['webm', 'mp3', 'mp4', 'wav', 'flac', 'ogg', 'amr'];
const MIN_AUDIO_SIZE_BYTES = 1000; // ~1KB minimum to avoid "too short" audio
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 60; // 60 seconds max wait

function extractUserId(event: APIGatewayProxyEvent): string | null {
  return event.requestContext.authorizer?.claims?.sub ?? null;
}

function successResponse(body: Record<string, unknown>): APIGatewayProxyResult {
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function errorResponse(statusCode: number, error: string, message: string): APIGatewayProxyResult {
  return { statusCode, headers: CORS_HEADERS, body: JSON.stringify({ error, message }) };
}

function getFileExtension(key: string): string {
  const parts = key.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function mapExtensionToMediaFormat(ext: string): string {
  const formatMap: Record<string, string> = {
    webm: 'webm',
    mp3: 'mp3',
    mp4: 'mp4',
    wav: 'wav',
    flac: 'flac',
    ogg: 'ogg',
    amr: 'amr',
  };
  return formatMap[ext] || '';
}

async function validateAudioFile(audioS3Key: string): Promise<{ valid: true } | { valid: false; statusCode: number; message: string }> {
  const ext = getFileExtension(audioS3Key);
  if (!ext || !SUPPORTED_FORMATS.includes(ext)) {
    return {
      valid: false,
      statusCode: 400,
      message: `Format audio tidak didukung: .${ext || '(tidak ada ekstensi)'}. Format yang didukung: ${SUPPORTED_FORMATS.map(f => '.' + f).join(', ')}`,
    };
  }

  try {
    const headResult = await s3Client.send(
      new HeadObjectCommand({
        Bucket: AUDIO_BUCKET_NAME,
        Key: audioS3Key,
      })
    );

    const contentLength = headResult.ContentLength ?? 0;
    if (contentLength < MIN_AUDIO_SIZE_BYTES) {
      return {
        valid: false,
        statusCode: 400,
        message: 'Audio terlalu pendek. Pastikan rekaman Anda minimal 1 detik.',
      };
    }

    return { valid: true };
  } catch (err: unknown) {
    const error = err as { name?: string };
    if (error.name === 'NotFound' || error.name === 'NoSuchKey') {
      return {
        valid: false,
        statusCode: 400,
        message: 'File audio tidak ditemukan di storage. Silakan upload ulang.',
      };
    }
    throw err;
  }
}

async function startTranscriptionJob(audioS3Key: string): Promise<string> {
  const jobName = `transcribe-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const ext = getFileExtension(audioS3Key);
  const mediaFormat = mapExtensionToMediaFormat(ext);

  await transcribeClient.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      LanguageCode: 'en-US',
      MediaFormat: mediaFormat as 'mp3' | 'mp4' | 'wav' | 'flac' | 'ogg' | 'amr' | 'webm',
      Media: {
        MediaFileUri: `s3://${AUDIO_BUCKET_NAME}/${audioS3Key}`,
      },
    })
  );

  return jobName;
}

async function pollTranscriptionResult(jobName: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const result = await transcribeClient.send(
      new GetTranscriptionJobCommand({
        TranscriptionJobName: jobName,
      })
    );

    const status = result.TranscriptionJob?.TranscriptionJobStatus;

    if (status === TranscriptionJobStatus.COMPLETED) {
      const transcriptUri = result.TranscriptionJob?.Transcript?.TranscriptFileUri;
      if (!transcriptUri) {
        throw new Error('Transcription completed but no transcript URI found');
      }

      // Fetch the transcript JSON from the URI
      const response = await fetch(transcriptUri);
      if (!response.ok) {
        throw new Error(`Failed to fetch transcript: ${response.statusText}`);
      }
      const transcriptData = await response.json() as {
        results?: { transcripts?: Array<{ transcript?: string }> };
      };
      const transcript = transcriptData.results?.transcripts?.[0]?.transcript ?? '';

      if (!transcript) {
        throw new Error('Audio tidak terdeteksi. Pastikan Anda berbicara dengan jelas.');
      }

      return transcript;
    }

    if (status === TranscriptionJobStatus.FAILED) {
      const failureReason = result.TranscriptionJob?.FailureReason || 'Unknown error';
      throw new Error(`Transcription failed: ${failureReason}`);
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('Transcription timed out after maximum polling attempts');
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

    const { audioS3Key } = body as { audioS3Key?: string };

    // Validate required field
    if (!audioS3Key || typeof audioS3Key !== 'string' || audioS3Key.trim() === '') {
      return errorResponse(400, 'Bad Request', 'Missing required field: audioS3Key');
    }

    // Validate that the audio key belongs to the requesting user
    if (!audioS3Key.startsWith(`${userId}/`)) {
      return errorResponse(403, 'Forbidden', 'Akses ditolak: Anda hanya dapat mengakses file audio milik Anda sendiri');
    }

    // Validate audio file (format and size)
    const validation = await validateAudioFile(audioS3Key);
    if (!validation.valid) {
      return errorResponse(validation.statusCode, 'Bad Request', validation.message);
    }

    // Start transcription job
    const jobName = await startTranscriptionJob(audioS3Key);

    // Poll for results
    const transcription = await pollTranscriptionResult(jobName);

    return successResponse({
      transcription,
      audioS3Key,
    });
  } catch (err: unknown) {
    const error = err as { message?: string };
    console.error('Transcribe handler error:', error);

    // Check for specific error messages to return appropriate status codes
    const message = error.message || 'Terjadi kesalahan internal';

    if (message.includes('Audio tidak terdeteksi')) {
      return errorResponse(400, 'Bad Request', message);
    }

    if (message.includes('timed out')) {
      return errorResponse(408, 'Request Timeout', 'Transkripsi membutuhkan waktu terlalu lama. Silakan coba lagi.');
    }

    return errorResponse(500, 'Internal Server Error', 'Terjadi kesalahan internal');
  }
};
