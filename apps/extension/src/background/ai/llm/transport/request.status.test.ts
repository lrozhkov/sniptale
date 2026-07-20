import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';

const loggerDebugMock = vi.fn();
const loggerErrorMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    debug: loggerDebugMock,
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

function createRecordedRequest(input: RequestInfo | URL, init?: RequestInit) {
  return {
    body: init?.body ? JSON.parse(String(init.body)) : null,
    method: init?.method ?? 'GET',
    url: String(input),
  };
}

function resetTransportMocks() {
  loggerDebugMock.mockReset();
  loggerErrorMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
}

function createMultimodalRequestArgs() {
  return {
    apiKey: 'secret-key',
    baseUrl: 'https://ollama.local',
    modelCode: 'gpt-4.1',
    userContent: [{ type: 'text' as const, text: 'Project snapshot' }],
  };
}

beforeEach(resetTransportMocks);
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('maps rate-limit and server failures onto translated transport errors', async () => {
  const { requestChatCompletion } = await import('./request');
  const requests: ReturnType<typeof createRecordedRequest>[] = [];

  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(createRecordedRequest(input, init));

    return new Response('{}', {
      headers: { 'Content-Type': 'application/json' },
      status: requests.length === 1 ? 429 : 500,
    });
  });

  await expect(
    requestChatCompletion({
      apiKey: 'secret-key',
      baseUrl: 'https://ollama.local',
      modelCode: 'llama3.2',
      systemPrompt: 'Return JSON',
      userPrompt: 'Summarize this page',
    })
  ).rejects.toThrow(translate('background.runtime.llmRateLimitExceeded'));

  await expect(
    requestChatCompletion({
      apiKey: 'secret-key',
      baseUrl: 'https://ollama.local',
      modelCode: 'llama3.2',
      systemPrompt: 'Return JSON',
      userPrompt: 'Summarize this page',
    })
  ).rejects.toThrow(translate('background.runtime.llmServerError'));
});

it('joins multimodal text parts from multimodal provider responses', async () => {
  const { requestMultimodalChatCompletion } = await import('./request');
  const requests: ReturnType<typeof createRecordedRequest>[] = [];

  fetchMock.mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(createRecordedRequest(input, init));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: '{"steps":[' },
                { type: 'image_url' },
                { type: 'text', text: ']}' },
              ],
            },
          },
        ],
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  });

  await expect(
    requestMultimodalChatCompletion({
      ...createMultimodalRequestArgs(),
      providerErrorLabel: 'Ollama local',
      systemPrompt: 'Return JSON',
    })
  ).resolves.toBe('{"steps":[\n]}');
});

it('maps unknown provider error payloads without exposing provider body text', async () => {
  const { requestMultimodalChatCompletion } = await import('./request');
  const requests: ReturnType<typeof createRecordedRequest>[] = [];

  fetchMock.mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(createRecordedRequest(input, init));
    return new Response(JSON.stringify({ error: { message: 'upstream body token=secret' } }), {
      headers: { 'Content-Type': 'application/json' },
      status: 418,
    });
  });

  let thrownError: unknown;
  try {
    await requestMultimodalChatCompletion({
      ...createMultimodalRequestArgs(),
      systemPrompt: 'Return JSON',
    });
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(Error);
  expect((thrownError as Error).message).toBe('API error (418): Unknown error');
  expect((thrownError as Error).message).not.toMatch(/upstream body|token=secret/);
});

it('maps aborted transport requests onto the translated timeout error', async () => {
  const { requestChatCompletion } = await import('./request');

  fetchMock.mockImplementation(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      })
  );

  const pending = requestChatCompletion({
    apiKey: 'secret-key',
    baseUrl: 'https://ollama.local',
    modelCode: 'llama3.2',
    systemPrompt: 'Return JSON',
    userPrompt: 'Summarize this page',
  });
  const rejection = expect(pending).rejects.toThrow(
    translate('background.runtime.llmRequestTimeout')
  );

  await vi.advanceTimersByTimeAsync(30_000);

  await rejection;
});
