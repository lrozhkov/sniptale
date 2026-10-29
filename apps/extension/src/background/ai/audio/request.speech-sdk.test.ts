import { afterEach, expect, it, vi } from 'vitest';
import { requestAudio } from './request';
import { wrapPcmWav } from './pcm-wav';
import { getAIProviderDefinition } from '../../../contracts/settings/ai-provider';
import type { AudioJobStart } from '../../../contracts/ai/audio';
import type { AudioModelConfig } from './model-config';

const speech: AudioJobStart = {
  type: 'start',
  requestId: 'sdk-request',
  operation: 'speech',
  modelId: 'sdk-model',
  scope: {
    workspaceId: 'workspace',
    workspaceRevision: 1,
    target: { kind: 'voiceover', clipId: 'clip' },
    assetId: 'asset',
    nativeStart: 0,
    nativeEnd: 1,
  },
  phraseId: 'phrase',
  textRevision: 1,
  text: 'hello',
  profile: { voiceId: 'voice', responseFormat: 'mp3' },
};
const speechConfig: AudioModelConfig = {
  connectionType: 'openai-compatible',
  baseUrl: 'https://example.test/v1',
  url: 'https://example.test/v1/audio/speech',
  apiKey: 'fixture',
  modelCode: 'speech',
  speech: speech.profile,
};
const pcmRequest: AudioJobStart = {
  ...speech,
  profile: { ...speech.profile, responseFormat: 'pcm' },
};
const pcmConfig: AudioModelConfig = { ...speechConfig, speech: pcmRequest.profile };
function run(request = speech, config = speechConfig) {
  return requestAudio({ request, config, signal: new AbortController().signal, onReceiving() {} });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each([
  'openai',
  'neuraldeep',
  'lm-studio',
  'google',
  'elevenlabs',
  'deepgram',
  'mistral',
  'xai',
] as const)(
  'uses the ready-made %s speech adapter within its admitted origin',
  async (connectionType) => {
    const definition = getAIProviderDefinition(connectionType);
    const baseUrl = definition.baseUrl;
    const wav = new Uint8Array(await wrapPcmWav(new Uint8Array([0, 0, 0, 0])).arrayBuffer());
    const format = connectionType === 'google' ? ('wav' as const) : ('mp3' as const);
    const json = connectionType === 'google' || connectionType === 'mistral';
    const encoded = btoa(String.fromCharCode(...wav));
    const response =
      connectionType === 'google'
        ? JSON.stringify({
            candidates: [
              { content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: encoded } }] } },
            ],
          })
        : connectionType === 'mistral'
          ? JSON.stringify({ audio_data: btoa(String.fromCharCode(73, 68, 51, 0)) })
          : new Uint8Array([1, 2, 3, 4]);
    const post = vi.fn<typeof fetch>(
      async () =>
        new Response(response, {
          headers: { 'Content-Type': json ? 'application/json' : 'audio/mpeg' },
        })
    );
    vi.stubGlobal('fetch', post);
    const profile = { voiceId: 'fixture-voice', responseFormat: format };
    const result = await run(
      { ...speech, profile },
      {
        ...speechConfig,
        connectionType,
        baseUrl,
        modelCode:
          connectionType === 'google'
            ? 'gemini-2.5-flash-preview-tts'
            : connectionType === 'deepgram'
              ? 'aura-2'
              : 'fixture-model',
        speech: profile,
      }
    );
    expect(result.kind).toBe('audio');
    expect(post).toHaveBeenCalledOnce();
    const call = post.mock.calls[0]!;
    const actualUrl = new URL(String(call[0]));
    expect(actualUrl.origin).toBe(new URL(baseUrl).origin);
    expect(call[1]).toMatchObject({
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    const headers = new Headers(call[1]?.headers);
    expect(
      headers.get(
        connectionType === 'elevenlabs'
          ? 'xi-api-key'
          : connectionType === 'google'
            ? 'x-goog-api-key'
            : 'authorization'
      )
    ).toContain('fixture');
    if (connectionType === 'elevenlabs')
      expect(actualUrl.pathname).toBe('/v1/text-to-speech/fixture-voice');
    if (connectionType === 'deepgram') expect(actualUrl.pathname).toBe('/v1/speak');
    if (connectionType === 'xai') expect(actualUrl.pathname).toBe('/v1/tts');
    if (connectionType === 'google') expect(actualUrl.pathname).toContain(':generateContent');
    const payload: unknown = JSON.parse(String(call[1]?.body));
    expect(payload).toEqual(expect.any(Object));
    if (!json)
      expect(result).toMatchObject({ blob: expect.objectContaining({ type: 'audio/mpeg' }) });
  }
);

it.each(['google', 'elevenlabs', 'deepgram', 'mistral', 'xai'] as const)(
  'refuses an unsupported %s PCM profile before any paid request',
  async (connectionType) => {
    const post = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', post);
    await expect(run(pcmRequest, { ...pcmConfig, connectionType })).rejects.toThrow(
      'provider-request'
    );
    expect(post).not.toHaveBeenCalled();
  }
);

it('refuses an SDK redirect response without following it or returning audio', async () => {
  const post = vi.fn<typeof fetch>(
    async () =>
      new Response(null, {
        status: 307,
        headers: { location: 'https://elsewhere.test', 'Content-Type': 'audio/mpeg' },
      })
  );
  vi.stubGlobal('fetch', post);
  await expect(run()).rejects.toThrow('provider-failed');
  expect(post).toHaveBeenCalledOnce();
});

it('retains the audio job deadline beyond the SDK transport text timeout', async () => {
  vi.useFakeTimers();
  let release!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const signals: AbortSignal[] = [];
  const post = vi.fn<typeof fetch>(async (_input, init) => {
    if (init?.signal) signals.push(init.signal);
    return response;
  });
  vi.stubGlobal('fetch', post);
  const operation = run().then(
    () => null,
    (error: unknown) => error
  );
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(post).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(31_000);
    const abortedAtTextDeadline = signals[0]?.aborted;
    release(
      new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'audio/mpeg' } })
    );
    await operation;
    expect(abortedAtTextDeadline).toBe(false);
  } finally {
    release(
      new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'audio/mpeg' } })
    );
    await operation;
    vi.useRealTimers();
  }
});
