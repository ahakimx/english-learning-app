import { uploadData } from 'aws-amplify/storage';

/**
 * Upload an audio blob to S3 via Amplify Storage.
 * Returns the S3 key for the uploaded file.
 */
export async function uploadAudio(
  blob: Blob,
  userId: string,
  sessionId: string,
  questionId: string,
): Promise<string> {
  const key = `${userId}/${sessionId}/${questionId}.webm`;

  await uploadData({
    path: key,
    data: blob,
    options: {
      contentType: blob.type || 'audio/webm',
    },
  });

  return key;
}
