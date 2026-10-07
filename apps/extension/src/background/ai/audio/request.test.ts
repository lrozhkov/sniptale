import { afterEach, expect, it, vi } from 'vitest';
import { requestAudio } from './request';
import { AUDIO_INPUT_MAX_BYTES, type AudioJobStart } from '../../../contracts/ai/audio';
import type { AudioModelConfig } from './model-config';

const scope = {
  workspaceId: 'w',
  workspaceRevision: 1,
  clipId: 'c',
  assetId: 'a',
  nativeStart: 0,
  nativeEnd: 1,
};
const speech: AudioJobStart = {
  type: 'start',
  requestId: 'r',
  operation: 'speech',
  modelId: 'm',
  scope,
  phraseId: 'p',
  textRevision: 1,
  text: 'hello',
  profile: { voiceId: 'voice', responseFormat: 'mp3' },
};
const transcription: AudioJobStart = {
  type: 'start',
  requestId: 'r',
  operation: 'transcription',
  modelId: 'm',
  scope,
};
const speechConfig: AudioModelConfig = {
  url: 'https://example.test/audio/speech',
  apiKey: 'fixture',
  modelCode: 'speech',
  speech: speech.profile,
};
const transcriptionConfig: AudioModelConfig = {
  ...speechConfig,
  transcription: { responseFormat: 'json', timestampGranularity: 'none' },
};
const input = new File(['bytes'], 'audio.wav', { type: 'audio/wav' });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function run(request = speech, config = speechConfig) {
  return requestAudio({
    request,
    config,
    ...(request.operation === 'transcription' ? { input } : {}),
    signal: new AbortController().signal,
    onReceiving() {},
  });
}

it.each([
  [400, 'provider-request'],
  [422, 'provider-request'],
  [404, 'provider-not-found'],
  [405, 'provider-not-found'],
  [413, 'too-large'],
  [401, 'provider-auth'],
  [403, 'provider-auth'],
  [429, 'provider-rate-limit'],
  [500, 'provider-failed'],
] as const)('rejects HTTP %s without reading or exposing its error body', async (status, code) => {
  const cancel = vi.fn();
  const body = new ReadableStream({ cancel });
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(body, { status }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(run()).rejects.toThrow(code);
  expect(cancel).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('rejects an incomplete operation before fetch or an already cancelled request', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  const noParameters = { url: speechConfig.url, apiKey: 'fixture', modelCode: 'model' };
  await expect(run(speech, noParameters)).rejects.toThrow('invalid-request');
  await expect(run(transcription, noParameters)).rejects.toThrow('invalid-request');
  await expect(
    requestAudio({
      request: transcription,
      config: transcriptionConfig,
      signal: new AbortController().signal,
      onReceiving() {},
    })
  ).rejects.toThrow('invalid-request');
  const controller = new AbortController();
  controller.abort();
  await expect(
    requestAudio({
      request: speech,
      config: speechConfig,
      signal: controller.signal,
      onReceiving() {},
    })
  ).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});
it('accepts WAV alias and encodes optional synthesis parameters exactly once', async () => {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(new Uint8Array([82, 73, 70, 70]), {
        headers: { 'Content-Type': 'audio/x-wav; charset=binary', 'Content-Length': '4' },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  const result = await run(speech, {
    ...speechConfig,
    speech: { voiceId: 'voice', responseFormat: 'wav', speed: 1.5, instructions: 'Clear.' },
  });
  expect(result.kind).toBe('audio');
  if (result.kind === 'audio') expect(result.blob.type).toBe('audio/wav');
  expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
    JSON.stringify({
      model: 'speech',
      input: 'hello',
      voice: 'voice',
      response_format: 'wav',
      speed: 1.5,
      instructions: 'Clear.',
    })
  );
});
it('includes prompt and optional word granularity only when explicitly configured', async () => {
  const fetchMock = vi.fn<typeof fetch>(
    async () => new Response('{"text":""}', { headers: { 'Content-Type': 'application/json' } })
  );
  vi.stubGlobal('fetch', fetchMock);
  await run(transcription, {
    ...transcriptionConfig,
    transcription: {
      responseFormat: 'verbose_json',
      timestampGranularity: 'word',
      prompt: 'Names',
      language: 'en',
    },
  });
  const verboseRequest = fetchMock.mock.calls[0]?.[1];
  expect(verboseRequest?.body).toBeInstanceOf(ArrayBuffer);
  const verbose = await new Response(verboseRequest?.body, {
    headers: new Headers(verboseRequest?.headers),
  }).formData();
  const uploaded = verbose.get('file');
  if (!(uploaded instanceof File)) throw new Error('Expected audio file');
  expect(uploaded.name).toBe('audio.wav');
  expect(uploaded.type).toBe('audio/wav');
  expect(await uploaded.text()).toBe('bytes');
  expect(verbose.get('model')).toBe('speech');
  expect(verbose.get('response_format')).toBe('verbose_json');
  expect(verbose.get('language')).toBe('en');
  expect(verbose.get('prompt')).toBe('Names');
  expect(verbose.get('timestamp_granularities[]')).toBe('word');
  await run(transcription, transcriptionConfig);
  const plainRequest = fetchMock.mock.calls[1]?.[1];
  const plain = await new Response(plainRequest?.body, {
    headers: new Headers(plainRequest?.headers),
  }).formData();
  expect(plain.has('prompt')).toBe(false);
  expect(plain.has('timestamp_granularities[]')).toBe(false);
});
it.each([
  'not JSON',
  '{}',
  '{"text":false}',
  '{"text":"a","words":[{"word":"a","start":0,"end":2}]}',
])('rejects malformed transcription data without exposing it: %s', async (body) => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async () => new Response(body, { headers: { 'Content-Type': 'application/json' } })
    )
  );
  await expect(run(transcription, transcriptionConfig)).rejects.toThrow('invalid-response');
});
it('rejects invalid UTF-8 and empty or MIME-less binary responses', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValueOnce(
    new Response(new Uint8Array([255]), { headers: { 'Content-Type': 'application/json' } })
  );
  await expect(run(transcription, transcriptionConfig)).rejects.toThrow('invalid-response');
  fetchMock.mockResolvedValueOnce(
    new Response(null, { headers: { 'Content-Type': 'audio/mpeg' } })
  );
  await expect(run()).rejects.toThrow('invalid-response');
  fetchMock.mockResolvedValueOnce(
    new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } })
  );
  await expect(run()).rejects.toThrow('invalid-response');
  fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4])));
  await expect(run()).rejects.toThrow('invalid-response');
});
it('enforces streamed byte limits even without Content-Length and cancels the reader', async () => {
  const cancel = vi.fn();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024 + 1));
    },
    cancel,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async () => new Response(body, { headers: { 'Content-Type': 'application/json' } })
    )
  );
  await expect(run(transcription, transcriptionConfig)).rejects.toThrow('too-large');
  expect(cancel).toHaveBeenCalledOnce();
});
it('rejects a malformed Content-Length and propagates a failed stream without retry', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValueOnce(
    new Response('data', { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': 'invalid' } })
  );
  await expect(run()).rejects.toThrow('too-large');
  fetchMock.mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('stream failed'));
        },
      }),
      { headers: { 'Content-Type': 'audio/mpeg' } }
    )
  );
  await expect(run()).rejects.toThrow(/^network-failed$/);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('reports a fixed network failure without retrying or exposing the raw exception', async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new TypeError('private endpoint detail'));
  vi.stubGlobal('fetch', fetchMock);
  await expect(run()).rejects.toThrow(/^network-failed$/);
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('rejects unreadable staged audio locally before making a paid request', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(Response.prototype, 'arrayBuffer').mockRejectedValueOnce(
    new Error('private local path')
  );
  await expect(run(transcription, transcriptionConfig)).rejects.toThrow(/^storage-failed$/);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('does not start a request when cancelled during multipart preparation', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  vi.spyOn(input, 'stream').mockImplementation(
    () =>
      new ReadableStream({
        start(stream) {
          controller.abort();
          stream.enqueue(new TextEncoder().encode('bytes'));
          stream.close();
        },
      })
  );
  await expect(
    requestAudio({
      request: transcription,
      config: transcriptionConfig,
      input,
      signal: controller.signal,
      onReceiving() {},
    })
  ).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('rejects an oversized input before reading it or making a request', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(input, 'size', 'get').mockReturnValue(AUDIO_INPUT_MAX_BYTES + 1);
  const read = vi.spyOn(input, 'stream');
  await expect(run(transcription, transcriptionConfig)).rejects.toThrow(/^too-large$/);
  expect(read).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});
