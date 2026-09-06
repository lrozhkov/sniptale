import { translate } from '../../../../platform/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerDebugMock = vi.fn();
const loggerErrorMock = vi.fn();
const createLoggerMock = vi.fn(() => ({
  debug: loggerDebugMock,
  error: loggerErrorMock,
  info: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: createLoggerMock,
}));

type RecordedRequest = {
  body: unknown;
  headers: Record<string, string>;
  method: string;
  url: string;
};

type MockJsonResponse = {
  body: unknown;
  ok?: boolean;
  status?: number;
};

const fetchMock = vi.fn();

function resetLlmTransportRequestMocks() {
  loggerDebugMock.mockReset();
  loggerErrorMock.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
}

function createRecordedRequest(input: RequestInfo | URL, init?: RequestInit): RecordedRequest {
  return {
    body: init?.body ? JSON.parse(String(init.body)) : null,
    headers: {
      authorization: String((init?.headers as Record<string, string>)?.['Authorization'] ?? ''),
      'content-type': String((init?.headers as Record<string, string>)?.['Content-Type'] ?? ''),
    },
    method: init?.method ?? 'GET',
    url: String(input),
  };
}

function getOnlyRecordedRequest(requests: RecordedRequest[]): RecordedRequest {
  expect(requests).toHaveLength(1);
  const [request] = requests;
  if (!request) {
    throw new Error('Expected a single recorded request');
  }
  return request;
}

function mockFetchResponse(response: MockJsonResponse, requests: RecordedRequest[]) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(createRecordedRequest(input, init));

    return new Response(JSON.stringify(response.body), {
      headers: { 'Content-Type': 'application/json' },
      status: response.status ?? (response.ok === false ? 500 : 200),
    });
  });
}

async function verifySuccessfulChatRequest() {
  const { extractJSON, extractMarkdownTables, requestChatCompletion } = await import('./request');
  const requests: RecordedRequest[] = [];

  mockFetchResponse(
    {
      body: {
        choices: [
          {
            message: {
              content: '```json\n{"status":"ok"}\n```',
            },
          },
        ],
      },
    },
    requests
  );

  const response = await requestChatCompletion({
    apiKey: 'secret-key',
    baseUrl: 'https://ollama.local/',
    modelCode: 'llama3.2',
    systemPrompt: 'Return JSON',
    userPrompt: 'Summarize this page',
  });

  expect(response).toBe('```json\n{"status":"ok"}\n```');
  expect(extractJSON(response)).toBe('{"status":"ok"}\n');
  expect(extractMarkdownTables('```markdown\n| a |\n| - |\n```')).toBe('| a |\n| - |\n');
  const request = getOnlyRecordedRequest(requests);

  expect(request).toMatchObject({
    method: 'POST',
    url: 'https://ollama.local/chat/completions',
  });
  expect(request.headers['authorization']).toBe('Bearer secret-key');
  expect(request.headers['content-type']).toContain('application/json');
  expect(request.body).toEqual({
    max_tokens: 4000,
    messages: [
      { role: 'system', content: 'Return JSON' },
      { role: 'user', content: 'Summarize this page' },
    ],
    model: 'llama3.2',
    temperature: 0.7,
  });
  expect(loggerDebugMock).toHaveBeenCalledWith('Received chat completion response', {
    apiUrl: 'https://ollama.local/chat/completions',
    status: 200,
  });
  expect(loggerDebugMock).toHaveBeenCalledWith('Parsed chat completion content', {
    contentLength: response.length,
  });
  expect(createLoggerMock).toHaveBeenCalledWith({ namespace: 'BackgroundLlmHttp' });
}

async function readMaxTokensForModel(modelCode: string): Promise<number> {
  const { requestChatCompletion } = await import('./request');
  const requests: RecordedRequest[] = [];
  mockFetchResponse({ body: { choices: [{ message: { content: 'ok' } }] } }, requests);
  await requestChatCompletion({
    apiKey: 'secret-key',
    baseUrl: 'https://ollama.local',
    modelCode,
    systemPrompt: 'system',
    userPrompt: 'user',
  });
  return (getOnlyRecordedRequest(requests).body as { max_tokens: number }).max_tokens;
}

async function verifyFenceExtractionContracts() {
  const { extractJSON, extractMarkdownTables } = await import('./request');

  expect(extractMarkdownTables('  ```MARKDOWN| a |\n```  ')).toBe('| a |\n');
  expect(extractJSON('  ```JSON{"ok":true}\n```  ')).toBe('{"ok":true}\n');
  expect(loggerDebugMock).toHaveBeenCalledWith('Extracted markdown tables', {
    cleanedLength: 6,
    rawLength: 24,
  });
  expect(loggerDebugMock).toHaveBeenCalledWith('Extracted JSON payload', {
    cleanedLength: 12,
    rawLength: 26,
  });
}

async function verifyProviderErrorSurface() {
  const { requestChatCompletion } = await import('./request');
  const requests: RecordedRequest[] = [];

  mockFetchResponse(
    {
      ok: false,
      status: 400,
      body: {
        error: {
          message: 'schema mismatch token=secret&session=abc',
        },
      },
    },
    requests
  );

  let thrownError: unknown;
  try {
    await requestChatCompletion({
      apiKey: 'secret-key',
      baseUrl: 'https://ollama.local',
      modelCode: 'llama3.2',
      providerErrorLabel: 'Ollama local',
      systemPrompt: 'Return JSON',
      userPrompt: 'Summarize this page',
    });
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(Error);
  expect((thrownError as Error).message).toBe(
    `${translate('background.runtime.llmInvalidRequestPrefix')} (Ollama local)`
  );
  expect((thrownError as Error).message).not.toMatch(/schema mismatch|token=secret|session=abc/);
}

async function verifyUnauthorizedErrorSurface() {
  const { requestChatCompletion } = await import('./request');
  const requests: RecordedRequest[] = [];

  mockFetchResponse(
    {
      ok: false,
      status: 401,
      body: {},
    },
    requests
  );

  await expect(
    requestChatCompletion({
      apiKey: 'invalid-key',
      baseUrl: 'https://ollama.local',
      modelCode: 'llama3.2',
      systemPrompt: 'Return JSON',
      userPrompt: 'Summarize this page',
    })
  ).rejects.toThrow(translate('background.runtime.llmInvalidApiKey'));
}

async function verifyMultimodalChatRequest() {
  const { requestMultimodalChatCompletion } = await import('./request');
  const requests: RecordedRequest[] = [];

  mockFetchResponse(
    {
      body: {
        choices: [
          {
            message: {
              content: [{ type: 'text', text: '{"steps":[]}' }],
            },
          },
        ],
      },
    },
    requests
  );

  const response = await requestMultimodalChatCompletion({
    apiKey: 'secret-key',
    baseUrl: 'https://ollama.local',
    modelCode: 'gpt-4.1',
    systemPrompt: 'Return JSON',
    userContent: [
      { type: 'text', text: 'Project snapshot' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,cGl4ZWw=' } },
    ],
  });

  expect(response).toBe('{"steps":[]}');
  expect(getOnlyRecordedRequest(requests).body).toEqual({
    max_tokens: 6000,
    messages: [
      { role: 'system', content: 'Return JSON' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Project snapshot' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,cGl4ZWw=' } },
        ],
      },
    ],
    model: 'gpt-4.1',
    temperature: 0.7,
  });
}

async function verifyUnexpectedResponseSurface() {
  const { requestChatCompletion } = await import('./request');
  const requests: RecordedRequest[] = [];

  mockFetchResponse(
    {
      body: {
        choices: [],
      },
    },
    requests
  );

  await expect(
    requestChatCompletion({
      apiKey: 'secret-key',
      baseUrl: 'https://ollama.local',
      modelCode: 'llama3.2',
      systemPrompt: 'Return JSON',
      userPrompt: 'Summarize this page',
    })
  ).rejects.toThrow(translate('background.runtime.llmUnexpectedResponse'));

  expect(loggerErrorMock).toHaveBeenCalledWith('Unexpected response structure from provider');
}

async function verifyNetworkFailureSurface() {
  const { requestChatCompletion } = await import('./request');
  const secretCanary = 'sk-transport-error-canary';
  fetchMock.mockRejectedValue(
    new Error(`socket failed Authorization: Bearer ${secretCanary} passphrase=never-log`)
  );

  let thrownError: unknown;
  try {
    await requestChatCompletion({
      apiKey: secretCanary,
      baseUrl: 'https://ollama.local',
      modelCode: 'llama3.2',
      systemPrompt: 'Return JSON',
      userPrompt: 'Summarize this page',
    });
  } catch (error) {
    thrownError = error;
  }

  expect(thrownError).toBeInstanceOf(Error);
  expect((thrownError as Error).message).toBe(
    translate('background.runtime.llmUnexpectedProcessingError')
  );
  expect(JSON.stringify(thrownError)).not.toContain(secretCanary);
  expect(JSON.stringify(loggerDebugMock.mock.calls)).not.toContain(secretCanary);
  expect(JSON.stringify(loggerErrorMock.mock.calls)).not.toContain(secretCanary);
}

async function verifyMalformedResponseVariants() {
  const { requestChatCompletion } = await import('./request');
  const malformed = [
    null,
    { choices: null },
    { choices: [null] },
    { choices: [{ message: null }] },
    { choices: [{ message: { content: [] } }] },
    { choices: [{ message: { content: [null, { text: 7 }] } }] },
    { choices: [{ message: { content: 7 } }] },
  ];

  for (const body of malformed) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    );
    await expect(
      requestChatCompletion({
        apiKey: 'secret-key',
        baseUrl: 'https://ollama.local',
        modelCode: 'custom-model',
        systemPrompt: 'system',
        userPrompt: 'user',
      })
    ).rejects.toThrow(translate('background.runtime.llmUnexpectedResponse'));
  }
}

async function verifyProviderErrorWithoutLabel() {
  const { requestChatCompletion } = await import('./request');
  fetchMock.mockResolvedValueOnce(
    new Response('{}', {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  );

  let thrown: unknown;
  try {
    await requestChatCompletion({
      apiKey: 'secret-key',
      baseUrl: 'https://ollama.local',
      modelCode: 'custom-model',
      systemPrompt: 'system',
      userPrompt: 'user',
    });
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toBe(translate('background.runtime.llmInvalidRequestPrefix'));
}

describe('transport/request', () => {
  beforeEach(resetLlmTransportRequestMocks);

  it(
    'posts a real chat completion request and keeps the request contract intact',
    verifySuccessfulChatRequest
  );
  it(
    'trims and removes case-insensitive fences with or without a newline',
    verifyFenceExtractionContracts
  );
  it.each([
    ['GPT-5-mini', 8_000],
    ['o1-preview', 8_000],
    ['claude-3', 6_000],
    ['gemini-2', 6_000],
    ['mistral-small', 4_000],
    ['qwen-2', 4_000],
    ['deepseek-r1', 4_000],
    ['custom-model', 3_000],
  ])('sets the bounded token budget for %s', async (modelCode, expected) => {
    await expect(readMaxTokensForModel(modelCode)).resolves.toBe(expected);
  });
  it(
    'surfaces provider-specific request errors from the API response body',
    verifyProviderErrorSurface
  );
  it(
    'maps unauthorized responses onto the invalid API key message',
    verifyUnauthorizedErrorSurface
  );
  it(
    'builds multimodal user content for vision-capable scenario requests',
    verifyMultimodalChatRequest
  );
  it(
    'rejects successful HTTP responses without chat completion content',
    verifyUnexpectedResponseSurface
  );
  it('rejects every malformed provider response shape', verifyMalformedResponseVariants);
  it('omits an absent provider label from invalid-request errors', verifyProviderErrorWithoutLabel);
  it('maps secret-bearing network failures onto a fixed safe error', verifyNetworkFailureSurface);
});
