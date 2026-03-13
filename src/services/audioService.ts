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

  const result = await uploadData({
    path: key,
    data: blob,
    options: {
      contentType: blob.type || 'audio/webm',
    },
  }).result;

  // Use the actual path from the upload result (may differ from input key)
  const actualPath = result.path;
  console.log('Upload result - input key:', key, 'actual path:', actualPath);

  return actualPath;
}
