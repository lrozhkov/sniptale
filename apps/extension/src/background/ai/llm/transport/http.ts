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
  url: string;
}): Promise<{ data: unknown; ok: boolean; status: number }> {
  const controller = new AbortController();
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
      signal: controller.signal,
    });
    const data: unknown = await readJsonWithLimit(response);

    return {
      data,
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(args.timeoutErrorMessage);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
