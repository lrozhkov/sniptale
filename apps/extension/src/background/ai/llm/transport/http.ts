import { isAllowedAIProviderBaseUrl } from '@sniptale/runtime-contracts/ai/provider-base-url-policy';

const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 30_000;
const MAX_LLM_RESPONSE_BYTES = 1_000_000;
const JSON_CONTENT_TYPE_PATTERN = /\b(?:application\/json|[^;\s]+\/[^;\s+]+\+json)\b/iu;
const textEncoder = new TextEncoder();

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

function createOversizedResponseError(): Error {
  return new Error(`LLM provider response exceeds ${MAX_LLM_RESPONSE_BYTES} bytes`);
}

function assertJsonContentType(response: Response): void {
  const contentType = response.headers.get('Content-Type');
  if (contentType && !JSON_CONTENT_TYPE_PATTERN.test(contentType)) {
    throw new Error('LLM provider response must be JSON');
  }
}

function assertContentLength(response: Response): void {
  const rawContentLength = response.headers.get('Content-Length');
  if (rawContentLength === null) {
    return;
  }

  const contentLength = Number(rawContentLength);
  if (Number.isFinite(contentLength) && contentLength > MAX_LLM_RESPONSE_BYTES) {
    throw createOversizedResponseError();
  }
}

async function readResponseTextWithLimit(response: Response): Promise<string> {
  assertJsonContentType(response);
  assertContentLength(response);

  if (!response.body) {
    const text = await response.text();
    if (textEncoder.encode(text).byteLength > MAX_LLM_RESPONSE_BYTES) {
      throw createOversizedResponseError();
    }
    return text;
  }

  const reader = response.body.getReader();
  const textDecoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    totalBytes += value.byteLength;
    if (totalBytes > MAX_LLM_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw createOversizedResponseError();
    }
    chunks.push(value);
  }

  return (
    chunks.map((chunk) => textDecoder.decode(chunk, { stream: true })).join('') +
    textDecoder.decode()
  );
}

async function readJsonWithLimit(response: Response): Promise<unknown> {
  const text = await readResponseTextWithLimit(response);
  if (text.trim() === '') {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

export async function postJsonWithTimeout(args: {
  body: object;
  headers: Record<string, string>;
  timeoutErrorMessage: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  url: string;
}): Promise<{ data: unknown; ok: boolean; status: number }> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  args.signal?.throwIfAborted();
  args.signal?.addEventListener('abort', abort, { once: true });
  const timeoutMs = args.timeoutMs ?? DEFAULT_LLM_REQUEST_TIMEOUT_MS;
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(args.url, {
      method: 'POST',
      headers: args.headers,
      body: JSON.stringify(args.body),
      // Provider POSTs carry prompt payloads and bearer headers; do not let fetch replay them.
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      // Error bodies are untrusted and unused; their format must not hide the HTTP status.
      void response.body?.cancel().catch(() => undefined);
      return { data: {}, ok: false, status: response.status };
    }
    const data: unknown = await readJsonWithLimit(response);

    return {
      data,
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      if (args.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      throw new Error(args.timeoutErrorMessage, { cause: error });
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    args.signal?.removeEventListener('abort', abort);
  }
}

export interface ProviderSdkFetchOptions {
  baseUrl: string;
  maxResponseBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  beforeSend?(): Promise<void>;
  transport?: typeof globalThis.fetch;
}

async function readSdkResponseBytes(
  response: Response,
  maximum: number
): Promise<Uint8Array<ArrayBuffer>> {
  const declared = response.headers.get('Content-Length');
  if (
    declared !== null &&
    (!Number.isFinite(Number(declared)) || Number(declared) < 0 || Number(declared) > maximum)
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('provider-response-too-large');
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel().catch(() => undefined);
        throw new Error('provider-response-too-large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Keeps SDK network effects inside the admitted destination and existing response budget. */
export function createProviderSdkFetch(options: ProviderSdkFetchOptions): typeof globalThis.fetch {
  if (!isAllowedAIProviderBaseUrl(options.baseUrl)) throw new Error('provider-destination-invalid');
  const base = new URL(options.baseUrl);
  const basePath = base.pathname.replace(/\/+$/u, '');
  return async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    );
    if (
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`))
    ) {
      throw new Error('provider-destination-changed');
    }
    options.signal?.throwIfAborted();
    await options.beforeSend?.();
    options.signal?.throwIfAborted();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? DEFAULT_LLM_REQUEST_TIMEOUT_MS
    );
    const signals = [controller.signal, options.signal, init?.signal].filter(
      (signal): signal is AbortSignal => signal !== undefined && signal !== null
    );
    const signal = signals.length ? AbortSignal.any(signals) : undefined;
    signal?.throwIfAborted();
    try {
      const response = await (options.transport ?? globalThis.fetch)(input, {
        ...init,
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        ...(signal ? { signal } : {}),
      });
      if (response.redirected || (response.status >= 300 && response.status < 400)) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error('provider-redirect-refused');
      }
      const bytes = await readSdkResponseBytes(
        response,
        options.maxResponseBytes ?? MAX_LLM_RESPONSE_BYTES
      );
      return new Response(
        response.status === 204 || response.status === 205 || response.status === 304
          ? null
          : bytes,
        {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        }
      );
    } finally {
      clearTimeout(timeout);
    }
  };
}
