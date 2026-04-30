/**
 * Shared Bedrock model invocation abstraction.
 *
 * Detects model provider (Anthropic Claude vs Amazon Nova) from the model ID
 * and formats request/response accordingly. This allows switching models by
 * changing only the BEDROCK_TEXT_MODEL_ID env var — no code changes needed.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrockClient = new BedrockRuntimeClient({});

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

type ModelProvider = 'anthropic' | 'amazon-nova';

function detectProvider(modelId: string): ModelProvider {
  if (modelId.includes('anthropic') || modelId.includes('claude')) {
    return 'anthropic';
  }
  return 'amazon-nova';
}

// ---------------------------------------------------------------------------
// Request/response formatting
// ---------------------------------------------------------------------------

interface InvokeOptions {
  modelId: string;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

function buildRequestBody(opts: InvokeOptions): string {
  const provider = detectProvider(opts.modelId);
  const maxTokens = opts.maxTokens ?? 2000;

  if (provider === 'anthropic') {
    const body: Record<string, unknown> = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: opts.userPrompt }],
    };
    if (opts.systemPrompt) {
      body.system = opts.systemPrompt;
    }
    return JSON.stringify(body);
  }

  // Amazon Nova format
  const body: Record<string, unknown> = {
    schemaVersion: 'messages-v1',
    messages: [{ role: 'user', content: [{ text: opts.userPrompt }] }],
    inferenceConfig: { max_new_tokens: maxTokens },
  };
  if (opts.systemPrompt) {
    body.system = [{ text: opts.systemPrompt }];
  }
  return JSON.stringify(body);
}

function parseResponseText(modelId: string, responseBody: Uint8Array): string {
  const body = JSON.parse(new TextDecoder().decode(responseBody));
  const provider = detectProvider(modelId);

  if (provider === 'anthropic') {
    return (body.content[0].text as string).trim();
  }

  // Amazon Nova
  return (body.output.message.content[0].text as string).trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Invoke a Bedrock text model with automatic provider detection.
 * Works with both Anthropic Claude and Amazon Nova models.
 */
export async function invokeTextModel(opts: InvokeOptions): Promise<string> {
  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: opts.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: buildRequestBody(opts),
    }),
    opts.abortSignal ? { abortSignal: opts.abortSignal } : undefined,
  );

  return parseResponseText(opts.modelId, response.body);
}

/**
 * Invoke with a timeout. Rejects if the call exceeds timeoutMs.
 */
export async function invokeTextModelWithTimeout(
  opts: InvokeOptions,
  timeoutMs: number,
): Promise<string> {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    return await invokeTextModel({ ...opts, abortSignal: abortController.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Invoke with timeout + retry logic.
 * Returns null after all attempts fail.
 */
export async function invokeTextModelWithRetry(
  opts: InvokeOptions,
  timeoutMs: number,
  maxRetries: number = 2,
): Promise<string | null> {
  const totalAttempts = 1 + maxRetries;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      return await invokeTextModelWithTimeout(opts, timeoutMs);
    } catch (error) {
      console.error(`Bedrock invoke attempt ${attempt}/${totalAttempts} failed:`, error);
      if (attempt === totalAttempts) {
        return null;
      }
    }
  }
  return null;
}
