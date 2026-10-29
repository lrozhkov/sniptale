import { afterEach, expect, it, vi } from 'vitest';
import { requestAudio } from './request';
import type { AudioModelConfig } from './model-config';
import type { AudioJobStart } from '../../../contracts/ai/audio';

const transcription: AudioJobStart = {
  type: 'start',
  requestId: 'chat-test',
  operation: 'transcription',
  modelId: 'model',
  scope: {
    workspaceId: 'w',
    workspaceRevision: 1,
    target: { kind: 'voiceover', clipId: 'c' },
    assetId: 'a',
    nativeStart: 0,
    nativeEnd: 1,
  },
};
const transcriptionConfig: AudioModelConfig = {
  connectionType: 'openai-compatible',
  baseUrl: 'https://provider.test/v1',
  url: 'https://provider.test/v1/chat/completions',
  apiKey: 'fixture',
  modelCode: 'declared',
};
const input = new File(['bytes'], 'audio.wav', { type: 'audio/wav' });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function run(request: AudioJobStart, config: AudioModelConfig) {
  return requestAudio({
    request,
    config,
    input,
    signal: new AbortController().signal,
    onReceiving() {},
  });
}

const chatConfig: AudioModelConfig = {
  ...transcriptionConfig,
  transcription: {
    transport: 'audio-chat',
    chatProtocol: 'openai',
    structuredOutput: 'json_object',
    responseFormat: 'json',
    timestampGranularity: 'none',
  },
};
const recognition = { mode: 'transcribe', granularity: 'sentence', prompt: '' } as const;

it.each(['openai', 'bothub'] as const)(
  'retains JSON Object selection through the %s SDK protocol',
  async (chatProtocol) => {
    const post = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [{ finish_reason: 'stop', message: { content: '{"segments":[]}' } }],
      })
    );
    vi.stubGlobal('fetch', post);
    await run(
      { ...transcription, recognition },
      { ...chatConfig, transcription: { ...chatConfig.transcription!, chatProtocol } }
    );
    const body = JSON.parse(post.mock.calls[0]![1]!.body as string);
    expect(chatProtocol === 'bothub' ? body.responseFormat : body.response_format).toEqual({
      type: 'json_object',
    });
    expect(chatProtocol === 'bothub' ? body.maxTokens : body.max_tokens).toBe(24000);
    expect(post).toHaveBeenCalledOnce();
  }
);

it.each([
  { choices: [{ finish_reason: 'length', message: { content: '{"segments":[]}' } }] },
  {
    choices: [
      { finish_reason: 'stop', message: { refusal: 'secret refusal', content: '{"segments":[]}' } },
    ],
  },
  {
    choices: [
      { finish_reason: 'stop', message: { content: '{"segments":[]}' } },
      { finish_reason: 'stop', message: { content: '{"segments":[]}' } },
    ],
  },
  {
    choices: [
      {
        finish_reason: 'stop',
        message: { content: '{"segments":[{"text":"bad","start":0,"end":2}]}' },
      },
    ],
  },
])('refuses invalid audio-chat completion without retries: %j', async (response) => {
  const post = vi.fn<typeof fetch>(async () => Response.json(response));
  vi.stubGlobal('fetch', post);
  await expect(run({ ...transcription, recognition }, chatConfig)).rejects.toThrow(
    'invalid-response'
  );
  expect(post).toHaveBeenCalledOnce();
});

it.each([401, 429, 500])(
  'does not retry paid audio-chat status %i or expose its body',
  async (status) => {
    const post = vi.fn<typeof fetch>(
      async () => new Response('private provider error', { status })
    );
    vi.stubGlobal('fetch', post);
    const failure = await run({ ...transcription, recognition }, chatConfig).catch(
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toHaveProperty('cause');
    expect(String(failure)).not.toContain('private provider error');
    expect(post).toHaveBeenCalledOnce();
  }
);

it('rechecks authority after audio-chat upload preparation and prevents stale egress', async () => {
  const post = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', post);
  const beforeSend = vi.fn(async () => {
    throw new Error('stale');
  });
  await expect(
    requestAudio({
      request: { ...transcription, recognition },
      config: chatConfig,
      input,
      signal: new AbortController().signal,
      onReceiving() {},
      beforeSend,
    })
  ).rejects.toThrow('stale');
  expect(beforeSend).toHaveBeenCalledOnce();
  expect(post).not.toHaveBeenCalled();
});

it('bounds audio-chat JSON bytes before SDK admission', async () => {
  const post = vi.fn<typeof fetch>(
    async () =>
      new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'Content-Type': 'application/json' } })
  );
  vi.stubGlobal('fetch', post);
  await expect(run({ ...transcription, recognition }, chatConfig)).rejects.toThrow('too-large');
  expect(post).toHaveBeenCalledOnce();
});
