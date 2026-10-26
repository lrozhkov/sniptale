import { describe, expect, it, vi } from 'vitest';
import { createProviderSdkFetch } from './llm/transport/http';
import { generateText } from 'ai';
import { createAIProviderRuntime } from './providers';
import {
  getAIProviderDefinition,
  AI_PROVIDER_TYPES,
  getAIProviderOperations,
} from '../../contracts/settings/ai-provider';

describe('ready-made AI provider integration', () => {
  it('constructs admitted providers without network or environment credentials', () => {
    const transport = vi.fn();
    for (const type of AI_PROVIDER_TYPES) {
      const definition = getAIProviderDefinition(type);
      if (!definition.available || type === 'chrome-built-in') continue;
      expect(
        createAIProviderRuntime({
          type,
          baseUrl: definition.baseUrl || 'https://provider.test/v1',
          apiKey: 'fixture-secret',
          fetch: transport,
          operation: getAIProviderOperations(type)[0]!,
        })
      ).toBeDefined();
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('executes compatible text through the SDK without gateway routing or retries', async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'fixture',
          object: 'chat.completion',
          created: 1,
          model: 'fixture-model',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    );
    const provider = createAIProviderRuntime({
      type: 'neuraldeep',
      baseUrl: 'https://api.neuraldeep.ru/v1',
      apiKey: 'fixture-secret',
      fetch: transport,
      operation: 'text',
    });
    const result = await generateText({
      model: provider.languageModel('fixture-model'),
      prompt: 'Reply OK.',
      maxRetries: 0,
    });
    expect(result.text).toBe('OK');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0]).toBe('https://api.neuraldeep.ru/v1/chat/completions');
  });

  it('leaves Chrome local and rejects the incompatible GigaChat runtime', () => {
    for (const type of ['chrome-built-in', 'gigachat'] as const) {
      expect(() =>
        createAIProviderRuntime({
          type,
          baseUrl: '',
          apiKey: '',
          fetch: vi.fn(),
          operation: getAIProviderOperations(type)[0]!,
        })
      ).toThrow('provider-runtime-unavailable');
    }
  });
});

const nativeWireFixtures = [
  {
    type: 'openai',
    endpoint: '/responses',
    header: 'authorization',
    response: {
      id: 'resp_fixture',
      object: 'response',
      created_at: 1,
      status: 'completed',
      output: [
        {
          id: 'msg_fixture',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'OK', annotations: [] }],
        },
      ],
      usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 },
    },
  },
  {
    type: 'anthropic',
    endpoint: '/messages',
    header: 'x-api-key',
    response: {
      id: 'msg_fixture',
      type: 'message',
      role: 'assistant',
      model: 'fixture-model',
      content: [{ type: 'text', text: 'OK' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 3, output_tokens: 1 },
    },
  },
  {
    type: 'google',
    endpoint: '/models/fixture-model:generateContent',
    header: 'x-goog-api-key',
    response: {
      candidates: [
        { index: 0, content: { role: 'model', parts: [{ text: 'OK' }] }, finishReason: 'STOP' },
      ],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1, totalTokenCount: 4 },
    },
  },
  {
    type: 'cohere',
    endpoint: '/chat',
    header: 'authorization',
    response: {
      id: 'fixture',
      finish_reason: 'COMPLETE',
      message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] },
      usage: {
        billed_units: { input_tokens: 3, output_tokens: 1 },
        tokens: { input_tokens: 3, output_tokens: 1 },
      },
    },
  },
  {
    type: 'ollama',
    endpoint: '/chat',
    header: null,
    response: {
      model: 'fixture-model',
      created_at: '2026-10-26T00:00:00.000Z',
      message: { role: 'assistant', content: 'OK' },
      done: true,
      done_reason: 'stop',
      prompt_eval_count: 3,
      eval_count: 1,
    },
  },
] as const;

it.each(nativeWireFixtures)(
  'executes $type through its native ready-made wire protocol and guarded fetch',
  async (fixture) => {
    const definition = getAIProviderDefinition(fixture.type);
    const beforeSend = vi.fn(async () => undefined);
    const transport = vi.fn(
      async (_input, _init) =>
        new Response(JSON.stringify(fixture.response), {
          headers: { 'Content-Type': 'application/json' },
        })
    );
    const guarded = createProviderSdkFetch({ baseUrl: definition.baseUrl, beforeSend, transport });
    const runtime = createAIProviderRuntime({
      type: fixture.type,
      baseUrl: definition.baseUrl,
      apiKey: 'fixture-secret',
      fetch: guarded,
      operation: 'text',
    });
    const result = await generateText({
      model: runtime.languageModel('fixture-model'),
      prompt: 'Reply OK.',
      maxOutputTokens: 32,
      maxRetries: 0,
    });
    expect(result.text).toBe('OK');
    expect(transport).toHaveBeenCalledOnce();
    expect(beforeSend).toHaveBeenCalledOnce();
    const [input, init] = transport.mock.calls[0]!;
    expect(input.toString()).toBe(definition.baseUrl + fixture.endpoint);
    expect(input.toString()).not.toContain('fixture-secret');
    expect(init).toMatchObject({ redirect: 'error', credentials: 'omit' });
    if (fixture.header)
      expect(new Headers(init?.headers).get(fixture.header)).toContain('fixture-secret');
  }
);

it('admits only operations implemented by the pinned provider packages', () => {
  const transport = vi.fn();
  for (const type of AI_PROVIDER_TYPES) {
    if (type === 'chrome-built-in' || type === 'gigachat') continue;
    for (const operation of getAIProviderOperations(type)) {
      const runtime = createAIProviderRuntime({
        type,
        baseUrl: getAIProviderDefinition(type).baseUrl || 'https://provider.test/v1',
        apiKey: 'fixture-secret',
        fetch: transport,
        operation,
      });
      expect(
        operation === 'text'
          ? runtime.languageModel('fixture-model')
          : operation === 'transcription'
            ? runtime.transcriptionModel?.('fixture-model')
            : runtime.speechModel?.('fixture-model')
      ).toBeDefined();
    }
  }
  expect(transport).not.toHaveBeenCalled();
});
