import { afterEach, expect, it, vi } from 'vitest';
import { getAIProviderDefinition } from '../../../contracts/settings/ai-provider';
import { requestAudio } from './request';
import type { AudioJobStart } from '../../../contracts/ai/audio';
import type { AudioModelConfig } from './model-config';

const input = new File(['synthetic'], 'audio.wav', { type: 'audio/wav' });
const config: AudioModelConfig = {
  connectionType: 'neuraldeep',
  baseUrl: 'https://api.neuraldeep.ru/v1',
  url: 'https://api.neuraldeep.ru/v1/audio/transcriptions',
  apiKey: 'fixture',
  modelCode: 'fixture-model',
  transcription: { responseFormat: 'verbose_json', timestampGranularity: 'word' },
};
const request: AudioJobStart = {
  type: 'start',
  requestId: 'transcription-contract',
  operation: 'transcription',
  modelId: 'model',
  scope: {
    workspaceId: 'workspace',
    workspaceRevision: 1,
    target: { kind: 'voiceover', clipId: 'clip' },
    assetId: 'asset',
    nativeStart: 0,
    nativeEnd: 1,
  },
};
const run = async (configuration = config, beforeSend?: () => Promise<void>) => {
  const result = await requestAudio({
    request,
    config: configuration,
    input,
    signal: new AbortController().signal,
    onReceiving() {},
    ...(beforeSend ? { beforeSend } : {}),
  });
  if (result.kind !== 'transcript') throw new Error('Expected transcript');
  return result.result;
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('preserves compatible word timings and segment fallback as separate validated arrays', async () => {
  const post = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          text: 'hello',
          words: [{ word: 'hello', start: 0.1, end: 0.8 }],
          segments: [
            {
              id: 0,
              seek: 0,
              text: 'hello',
              start: 0,
              end: 1,
              tokens: [],
              temperature: 0,
              avg_logprob: 0,
              compression_ratio: 1,
              no_speech_prob: 0,
            },
          ],
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
  );
  vi.stubGlobal('fetch', post);
  await expect(run()).resolves.toEqual({
    text: 'hello',
    words: [{ text: 'hello', start: 0.1, end: 0.8 }],
    segments: [{ text: 'hello', start: 0, end: 1 }],
  });
  expect(post).toHaveBeenCalledOnce();
});

const nativeResponses = {
  google: {
    steps: [
      {
        content: [
          {
            type: 'text',
            text: 'hello',
            annotations: [
              { type: 'word_info', text: 'hello', start_offset: '0s', end_offset: '1s' },
            ],
          },
        ],
      },
    ],
  },
  elevenlabs: {
    text: 'hello',
    language_code: 'en',
    language_probability: 1,
    words: [{ type: 'word', text: 'hello', start: 0, end: 1 }],
  },
  deepgram: {
    metadata: { duration: 1 },
    results: {
      channels: [
        {
          detected_language: 'en',
          alternatives: [{ transcript: 'hello', words: [{ word: 'hello', start: 0, end: 1 }] }],
        },
      ],
    },
  },
  mistral: {
    model: 'fixture-model',
    text: 'hello',
    language: 'en',
    segments: [{ text: 'hello', start: 0, end: 1 }],
  },
  xai: { text: 'hello', language: 'en', duration: 1, words: [{ text: 'hello', start: 0, end: 1 }] },
};

it.each(['google', 'elevenlabs', 'deepgram', 'mistral', 'xai'] as const)(
  'uses the ready-made %s transcriber and admits its normalized word intervals',
  async (connectionType) => {
    const post = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(nativeResponses[connectionType]), {
          headers: { 'Content-Type': 'application/json' },
        })
    );
    vi.stubGlobal('fetch', post);
    const baseUrl = getAIProviderDefinition(connectionType).baseUrl;
    await expect(run({ ...config, connectionType, baseUrl })).resolves.toEqual({
      text: 'hello',
      words: [{ text: 'hello', start: 0, end: 1 }],
    });
    expect(post).toHaveBeenCalledOnce();
    const call = post.mock.calls[0]!;
    expect(new URL(String(call[0])).origin).toBe(new URL(baseUrl).origin);
    expect(call[1]).toMatchObject({
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  }
);

it.each(['google', 'elevenlabs', 'deepgram', 'mistral', 'xai'] as const)(
  'refuses an unsupported free-text prompt for %s without POST',
  async (connectionType) => {
    const post = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', post);
    await expect(
      run({
        ...config,
        connectionType,
        transcription: { ...config.transcription!, prompt: 'Keep this literal instruction.' },
      })
    ).rejects.toThrow('provider-request');
    expect(post).not.toHaveBeenCalled();
  }
);

it('refuses stale final admission after SDK upload preparation without POST', async () => {
  const post = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', post);
  await expect(
    run(config, async () => {
      throw new Error('stale');
    })
  ).rejects.toThrow('stale');
  expect(post).not.toHaveBeenCalled();
});

it('refuses streaming-only SDK models before any network effect', async () => {
  const post = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', post);
  await expect(
    run({ ...config, connectionType: 'google', modelCode: 'gemini-3.5-transcribe-live' })
  ).rejects.toThrow('provider-request');
  expect(post).not.toHaveBeenCalled();
});

it('refuses a native SDK timing outside the admitted source duration', async () => {
  const post = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          results: {
            channels: [
              {
                alternatives: [
                  { transcript: 'hello', words: [{ word: 'hello', start: 0, end: 2 }] },
                ],
              },
            ],
          },
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
  );
  vi.stubGlobal('fetch', post);
  await expect(
    run({ ...config, connectionType: 'deepgram', baseUrl: 'https://api.deepgram.com/v1' })
  ).rejects.toThrow('invalid-response');
  expect(post).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'sends only admitted compatible timing granularities with segment fallback %s',
  async (fallback) => {
    const post = vi.fn<typeof fetch>(async () =>
      Response.json({ text: 'hello', words: [{ word: 'hello', start: 0, end: 1 }] })
    );
    vi.stubGlobal('fetch', post);
    const configuration = { ...config, transcriptionSegmentFallback: fallback };
    await expect(run(configuration)).resolves.toMatchObject({ text: 'hello' });
    const body = post.mock.calls[0]![1]!.body;
    if (!(body instanceof FormData)) throw new Error('Expected SDK multipart body');
    expect(body.getAll('timestamp_granularities[]')).toEqual(
      fallback ? ['word', 'segment'] : ['word']
    );
    expect(post).toHaveBeenCalledOnce();
  }
);
