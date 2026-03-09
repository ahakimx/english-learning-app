import { getAccessToken, refreshSession } from './authService';
import type { ChatRequest, ChatResponse, ProgressData } from '../types';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const AI_ANALYSIS_TIMEOUT_MS = 30_000;

/** Actions that involve AI analysis and should have a 30-second timeout */
const AI_ANALYSIS_ACTIONS: ReadonlySet<string> = new Set([
  'analyze_answer',
  'end_session',
  'grammar_explain',
  'writing_review',
]);

export interface ProgressUpdate {
  moduleType: 'speaking' | 'grammar' | 'writing';
  score: number;
  sessionId: string;
  details?: Record<string, unknown>;
}

export interface TranscriptionResponse {
  transcription: string;
}

export interface SpeakResponse {
  audioData: string; // base64 encoded audio
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class TimeoutError extends Error {
  constructor(message = 'Analisis membutuhkan waktu lebih lama dari yang diharapkan. Silakan coba lagi.') {
    super(message);
    this.name = 'TimeoutError';
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithAuth(
  url: string,
  options: RequestInit,
  retryCount = 0,
  hasRefreshed = false,
): Promise<Response> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 500;

  try {
    const response = await fetch(url, options);

    if (response.status === 401 && !hasRefreshed) {
      const newToken = await refreshSession();
      if (newToken) {
        const headers = {
          ...Object.fromEntries(new Headers(options.headers).entries()),
          Authorization: `Bearer ${newToken}`,
        };
        return fetchWithAuth(url, { ...options, headers }, retryCount, true);
      }
    }

    return response;
  } catch (error) {
    // AbortError should not be retried — propagate immediately
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    // Network error — retry with exponential backoff
    if (retryCount < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, retryCount);
      await sleep(delay);
      return fetchWithAuth(url, options, retryCount + 1, hasRefreshed);
    }
    throw error;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers = await getAuthHeaders();
  const url = `${API_URL}${path}`;

  try {
    const response = await fetchWithAuth(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      ...(signal ? { signal } : {}),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new ApiError(errorBody.message ?? 'Request failed', response.status);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new TimeoutError();
    }
    throw error;
  }
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const useTimeout = AI_ANALYSIS_ACTIONS.has(req.action);
  if (useTimeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_ANALYSIS_TIMEOUT_MS);
    try {
      return await request<ChatResponse>('POST', '/chat', req, controller.signal);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return request<ChatResponse>('POST', '/chat', req);
}

export async function transcribe(audioS3Key: string): Promise<TranscriptionResponse> {
  return request<TranscriptionResponse>('POST', '/transcribe', { audioS3Key });
}

export async function speak(text: string): Promise<SpeakResponse> {
  return request<SpeakResponse>('POST', '/speak', { text });
}

export async function getProgress(): Promise<ProgressData> {
  return request<ProgressData>('GET', '/progress');
}

export async function updateProgress(data: ProgressUpdate): Promise<void> {
  await request<{ message: string }>('POST', '/progress', data);
}

export { ApiError, TimeoutError };
