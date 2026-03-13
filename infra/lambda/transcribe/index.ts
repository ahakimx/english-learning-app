import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  TranscriptionJobStatus,
} from '@aws-sdk/client-transcribe';

const transcribeClient = new TranscribeClient({});

const AUDIO_BUCKET_NAME = process.env.AUDIO_BUCKET_NAME || '';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

const SUPPORTED_FORMATS = ['webm', 'mp3', 'mp4', 'wav', 'flac', 'ogg', 'amr'];
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

async function startTranscriptionJob(audioS3Key: string): Promise<string> {
  const jobName = `transcribe-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const ext = getFileExtension(audioS3Key);
  const mediaFormat = mapExtensionToMediaFormat(ext);
  const mediaFileUri = `s3://${AUDIO_BUCKET_NAME}/${audioS3Key}`;

  console.log('Starting transcription job:', { jobName, bucket: AUDIO_BUCKET_NAME, key: audioS3Key, mediaFileUri });

  await transcribeClient.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      LanguageCode: 'en-US',
      MediaFormat: mediaFormat as 'mp3' | 'mp4' | 'wav' | 'flac' | 'ogg' | 'amr' | 'webm',
      Media: {
        MediaFileUri: mediaFileUri,
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

    // Validate audio file format
    const ext = getFileExtension(audioS3Key);
    if (!ext || !SUPPORTED_FORMATS.includes(ext)) {
      return errorResponse(400, 'Bad Request', `Format audio tidak didukung: .${ext || '(tidak ada ekstensi)'}. Format yang didukung: ${SUPPORTED_FORMATS.map(f => '.' + f).join(', ')}`);
    }

    // Start transcription job
    try {
      const jobName = await startTranscriptionJob(audioS3Key);

      // Poll for results
      const transcription = await pollTranscriptionResult(jobName);

      return successResponse({
        transcription,
        audioS3Key,
      });
    } catch (err: unknown) {
      const error = err as { message?: string; name?: string };
      if (error.name === 'BadRequestException' || (error.message && error.message.includes("doesn't point"))) {
        return errorResponse(400, 'Bad Request', `Transcribe tidak bisa akses file audio. Pastikan file sudah terupload dengan benar.`);
      }
      throw err;
    }
  } catch (err: unknown) {
    const error = err as { message?: string; name?: string; Code?: string };
    console.error('Transcribe handler error:', JSON.stringify({
      message: error.message,
      name: error.name,
      code: error.Code,
    }));

    // Check for specific error messages to return appropriate status codes
    const message = error.message || 'Terjadi kesalahan internal';

    if (message.includes('Audio tidak terdeteksi')) {
      return errorResponse(400, 'Bad Request', message);
    }

    if (message.includes('timed out')) {
      return errorResponse(408, 'Request Timeout', 'Transkripsi membutuhkan waktu terlalu lama. Silakan coba lagi.');
    }

    if (error.name === 'AccessDeniedException' || message.includes('Access Denied') || message.includes('not authorized')) {
      return errorResponse(500, 'Internal Server Error', 'Lambda tidak memiliki izin yang diperlukan. Hubungi administrator.');
    }

    return errorResponse(500, 'Internal Server Error', `Terjadi kesalahan: ${error.name || 'Unknown'} - ${message}`);
  }
};
