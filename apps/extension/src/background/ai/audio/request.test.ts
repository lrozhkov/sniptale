import { afterEach, expect, it, vi } from 'vitest';
import { requestAudio, requestTranscription } from './request';
import { wrapPcmWav } from './pcm-wav';
import {
  AUDIO_INPUT_MAX_BYTES,
  AUDIO_OUTPUT_MAX_BYTES,
  type AudioJobStart,
} from '../../../contracts/ai/audio';
import type { AudioModelConfig } from './model-config';

const scope = {
  workspaceId: 'w',
  workspaceRevision: 1,
  target: { kind: 'voiceover' as const, clipId: 'c' },
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
  connectionType: 'openai-compatible',
  baseUrl: 'https://example.test',
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
const pcmRequest: AudioJobStart = {
  ...speech,
  profile: { ...speech.profile, responseFormat: 'pcm' },
};
const pcmConfig: AudioModelConfig = { ...speechConfig, speech: pcmRequest.profile };
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
  [400, 'provider-request', 'unknown'],
  [422, 'provider-request', 'unknown'],
  [404, 'provider-not-found', 'model-unavailable'],
  [405, 'provider-not-found', 'unknown'],
  [413, 'too-large', 'unknown'],
  [401, 'provider-auth', 'invalid-credential'],
  [403, 'provider-auth', 'permission-denied'],
  [402, 'provider-failed', 'quota-exceeded'],
  [429, 'provider-rate-limit', 'rate-limited'],
  [500, 'provider-failed', 'service-error'],
] as const)(
  'rejects HTTP %s without reading or exposing its error body',
  async (status, code, reason) => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(body, { status }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(run()).rejects.toMatchObject({ message: code, reason });
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  }
);
it('rejects an incomplete operation before fetch or an already cancelled request', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  const noParameters: AudioModelConfig = {
    connectionType: speechConfig.connectionType,
    baseUrl: speechConfig.baseUrl,
    url: speechConfig.url,
    apiKey: 'fixture',
    modelCode: 'model',
  };
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
it('requests segment fallback alongside explicitly configured word timing', async () => {
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
  expect(verboseRequest?.body).toBeInstanceOf(FormData);
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
  expect(verbose.getAll('timestamp_granularities[]')).toEqual(['word', 'segment']);
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
  vi.spyOn(input, 'arrayBuffer').mockRejectedValueOnce(new Error('private local path'));
  await expect(run(transcription, transcriptionConfig)).rejects.toThrow(/^storage-failed$/);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('does not start a request when cancelled during multipart preparation', async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  vi.spyOn(input, 'arrayBuffer').mockImplementationOnce(async () => {
    controller.abort();
    return new TextEncoder().encode('bytes').buffer;
  });
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

it('posts a complete declared multimodal file once and admits only schema-valid timed text', async () => {
  const body = JSON.stringify({
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            segments: [{ text: 'Hello.', start: 0, end: 1 }],
          }),
        },
      },
    ],
  });
  const post = vi.fn<typeof fetch>(
    async () => new Response(body, { headers: { 'Content-Type': 'application/json' } })
  );
  vi.stubGlobal('fetch', post);
  const result = await run(
    { ...transcription, recognition: { mode: 'transcribe', granularity: 'sentence', prompt: '' } },
    {
      ...transcriptionConfig,
      url: 'https://provider.test/v1/chat/completions',
      transcription: {
        transport: 'audio-chat',
        chatProtocol: 'bothub',
        structuredOutput: 'json_schema',
        responseFormat: 'json',
        timestampGranularity: 'none',
      },
    }
  );
  expect(post).toHaveBeenCalledTimes(1);
  const request = post.mock.calls[0]![1]!;
  expect(new Headers(request.headers).get('Content-Type')).toBe('application/json');
  const payload = JSON.parse(request.body as string);
  expect(payload.messages[1].content[1]).toEqual({
    type: 'image_url',
    image_url: { url: 'data:audio/wav;base64,Ynl0ZXM=' },
  });
  expect(payload.responseFormat).toMatchObject({
    type: 'json_schema',
    json_schema: { name: 'timed_transcript', strict: true },
  });
  expect(payload.maxTokens).toBe(24000);
  expect(payload).not.toHaveProperty('response_format');
  expect(payload).not.toHaveProperty('max_tokens');
  expect(result).toMatchObject({ kind: 'transcript', result: { text: 'Hello.' } });
});

it('preserves every audio byte across base64 block boundaries without extra POSTs', async () => {
  const bytes = Uint8Array.from({ length: 32766 * 2 + 5 }, (_, index) => index % 256);
  const post = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: '{"segments":[]}' } }],
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
  );
  vi.stubGlobal('fetch', post);
  await requestAudio({
    request: {
      ...transcription,
      recognition: { mode: 'transcribe', granularity: 'sentence', prompt: '' },
    },
    config: {
      ...transcriptionConfig,
      transcription: {
        transport: 'audio-chat',
        chatProtocol: 'openai',
        structuredOutput: 'json_schema',
        responseFormat: 'json',
        timestampGranularity: 'none',
      },
    },
    input: new File([bytes], 'audio.wav', { type: 'audio/wav' }),
    signal: new AbortController().signal,
    onReceiving() {},
  });
  expect(post).toHaveBeenCalledOnce();
  const payload = JSON.parse(post.mock.calls[0]![1]!.body as string);
  const encoded = payload.messages[1].content[1].input_audio.data;
  expect(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))).toEqual(bytes);
});

it('sends explicit PCM once and wraps the exact 24 kHz mono payload in WAV', async () => {
  const pcm = new Uint8Array(48_000);
  pcm.set([0, 128, 255, 127, 0, 0]);
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(pcm, {
        headers: {
          'Content-Type': 'Audio/PCM; rate=24000; channels=1',
          'Content-Length': String(pcm.length),
        },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  const request: AudioJobStart = {
    ...speech,
    profile: { ...speech.profile, responseFormat: 'pcm' },
  };
  const result = await run(request, { ...speechConfig, speech: request.profile });
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).response_format).toBe('pcm');
  expect(result.kind).toBe('audio');
  if (result.kind !== 'audio') throw new Error('Expected WAV');
  expect(result.blob.type).toBe('audio/wav');
  expect(result.blob.size).toBe(48_044);
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  expect(bytes.subarray(44)).toEqual(pcm);
  expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(24_000);
});

it.each([
  '',
  'application/json',
  'audio/wav',
  'audio/L16',
  'application/octet-stream',
  'audio/pcm; rate=48000',
  'audio/pcm; channels=2',
])('refuses unsupported PCM MIME %s and cancels the response without retry', async (mime) => {
  const cancel = vi.fn();
  const response = new Response(new ReadableStream({ cancel }), {
    headers: mime ? { 'Content-Type': mime } : {},
  });
  const fetchMock = vi.fn<typeof fetch>(async () => response);
  vi.stubGlobal('fetch', fetchMock);
  await expect(run(pcmRequest, pcmConfig)).rejects.toThrow('invalid-response');
  expect(cancel).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledOnce();
});
it.each([0, 1, 3])('rejects empty or incomplete PCM of %s bytes', async (length) => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async () =>
        new Response(new Uint8Array(length), {
          headers: { 'Content-Type': 'audio/pcm' },
        })
    )
  );
  await expect(run(pcmRequest, pcmConfig)).rejects.toThrow('invalid-response');
});
it('accepts odd transport chunks when the aggregate sample stream is complete', async () => {
  const pcm = new Uint8Array([0, 128, 255, 127, 0, 0]);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(pcm.slice(0, 1));
      controller.enqueue(pcm.slice(1, 4));
      controller.enqueue(pcm.slice(4));
      controller.close();
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async () =>
        new Response(body, {
          headers: { 'Content-Type': 'audio/pcm' },
        })
    )
  );
  const result = await run(pcmRequest, pcmConfig);
  if (result.kind !== 'audio') throw new Error('Expected WAV');
  expect(new Uint8Array(await result.blob.slice(44).arrayBuffer())).toEqual(pcm);
});
it.each([false, true])(
  'counts the WAV header in the real output budget, Content-Length=%s',
  async (declared) => {
    const length = AUDIO_OUTPUT_MAX_BYTES - 44;
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(new Uint8Array(length), {
          headers: {
            'Content-Type': 'audio/pcm',
            ...(declared ? { 'Content-Length': String(length) } : {}),
          },
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await run(pcmRequest, pcmConfig);
    if (result.kind !== 'audio') throw new Error('Expected WAV');
    expect(result.blob.size).toBe(AUDIO_OUTPUT_MAX_BYTES);
  }
);
it.each([false, true])(
  'rejects one sample beyond the output budget, Content-Length=%s',
  async (declared) => {
    const length = AUDIO_OUTPUT_MAX_BYTES - 44 + 2;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(length));
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        async () =>
          new Response(body, {
            headers: {
              'Content-Type': 'audio/pcm',
              ...(declared ? { 'Content-Length': String(length) } : {}),
            },
          })
      )
    );
    await expect(run(pcmRequest, pcmConfig)).rejects.toThrow('too-large');
    expect(cancel).toHaveBeenCalledOnce();
  }
);
it('does not return WAV when cancellation arrives while PCM is being read', async () => {
  const abort = new AbortController();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([0, 0]));
    },
    pull(controller) {
      abort.abort();
      controller.close();
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async () =>
        new Response(body, {
          headers: { 'Content-Type': 'audio/pcm' },
        })
    )
  );
  await expect(
    requestAudio({ request: pcmRequest, config: pcmConfig, signal: abort.signal, onReceiving() {} })
  ).rejects.toThrow();
});

it('refuses project transport without the coordinator admission callback', async () => {
  const post = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', post);
  await expect(
    requestAudio({
      request: {
        ...transcription,
        approvedProviderId: 'provider',
        scope: {
          projectId: 'project',
          projectRevision: 3,
          projectUpdatedAt: 10,
          target: { kind: 'project-clip', clipId: 'clip' },
          assetId: 'asset',
          nativeStart: 0,
          nativeEnd: 1,
        },
      },
      config: transcriptionConfig,
      input,
      signal: new AbortController().signal,
      onReceiving() {},
    })
  ).rejects.toThrow('unauthorized');
  expect(post).not.toHaveBeenCalled();
});

it('requires current project-text admission before the single speech POST', async () => {
  const request: AudioJobStart = {
    ...speech,
    approvedProviderId: 'provider',
    scope: {
      projectId: 'project',
      projectRevision: 3,
      projectUpdatedAt: 10,
      target: { kind: 'project-text', documentId: 'script', fragmentId: 'p' },
      basisHash: `sha256:${'a'.repeat(64)}`,
    },
  };
  const post = vi.fn<typeof fetch>(
    async () =>
      new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { 'Content-Type': 'audio/mpeg' },
      })
  );
  vi.stubGlobal('fetch', post);
  const args = {
    request,
    config: speechConfig,
    signal: new AbortController().signal,
    onReceiving() {},
  };
  await expect(requestAudio(args)).rejects.toThrow('unauthorized');
  expect(post).not.toHaveBeenCalled();
  const beforeSend = vi.fn<() => Promise<void>>(async () => {
    throw new Error('stale');
  });
  await expect(requestAudio({ ...args, beforeSend })).rejects.toThrow('stale');
  expect(post).not.toHaveBeenCalled();
  beforeSend.mockResolvedValueOnce(undefined);
  await expect(requestAudio({ ...args, beforeSend })).resolves.toMatchObject({ kind: 'audio' });
  expect(beforeSend).toHaveBeenCalledTimes(2);
  expect(beforeSend).toHaveBeenCalledBefore(post);
  expect(post).toHaveBeenCalledOnce();
  expect(post.mock.calls[0]?.[1]).toMatchObject({
    method: 'POST',
    body: JSON.stringify({
      model: 'speech',
      input: 'hello',
      voice: 'voice',
      response_format: 'mp3',
    }),
  });
});

it('sends Scenario text and profile without source scope metadata or video phrase fields', async () => {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(new Uint8Array([73, 68, 51, 0]), { headers: { 'Content-Type': 'audio/mpeg' } })
  );
  vi.stubGlobal('fetch', fetchMock);
  const scenario: AudioJobStart = {
    type: 'start',
    requestId: 'scenario',
    operation: 'speech',
    modelId: 'model',
    approvedProviderId: 'provider',
    text: 'Exact saved action',
    profile: speech.profile,
    scope: {
      workspaceId: 'scenario',
      workspaceRevision: 1,
      target: { kind: 'scenario-text', slideId: 'slide', objectId: 'action' },
      sourceTextHash: 'a'.repeat(64),
    },
  };
  await run(scenario);
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
    model: 'speech',
    input: 'Exact saved action',
    voice: 'voice',
    response_format: 'mp3',
  });
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
    redirect: 'error',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
});

function privateTranscriptionInput() {
  return new File([wrapPcmWav(new Uint8Array(48000))], 'dictation.wav', { type: 'audio/wav' });
}

it('transcribes private voice audio without a project scope after final admission', async () => {
  const order: string[] = [];
  const post = vi.fn<typeof fetch>(async (_url, init) => {
    order.push('post');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    return Response.json({ text: 'Recognized words' });
  });
  vi.stubGlobal('fetch', post);
  const result = await requestTranscription({
    config: transcriptionConfig,
    input: privateTranscriptionInput(),
    durationSeconds: 1,
    signal: new AbortController().signal,
    beforeSend: async () => {
      order.push('admit');
    },
    onReceiving() {},
  });
  expect(result.text).toBe('Recognized words');
  expect(order).toEqual(['admit', 'post']);
  expect(post).toHaveBeenCalledOnce();
});

it('preserves the private source when admission refuses the prepared transcription body', async () => {
  const post = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', post);
  const audio = privateTranscriptionInput();
  await expect(
    requestTranscription({
      config: transcriptionConfig,
      input: audio,
      durationSeconds: 1,
      signal: new AbortController().signal,
      beforeSend: async () => {
        throw new Error('stale');
      },
      onReceiving() {},
    })
  ).rejects.toThrow('stale');
  expect(post).not.toHaveBeenCalled();
  expect(audio.size).toBe(48044);
});

it('keeps an original WebM usable for multipart transcription and refuses to label it WAV', async () => {
  const post = vi.fn<typeof fetch>(async () => Response.json({ text: 'Original audio' }));
  vi.stubGlobal('fetch', post);
  const args = {
    config: transcriptionConfig,
    input: new File(['original'], 'dictation.webm', { type: 'audio/webm;codecs=opus' }),
    durationSeconds: 1,
    signal: new AbortController().signal,
    beforeSend: async () => {},
    onReceiving() {},
  };
  await expect(requestTranscription(args)).resolves.toMatchObject({ text: 'Original audio' });
  await expect(
    requestTranscription({
      ...args,
      config: {
        ...transcriptionConfig,
        transcription: {
          ...transcriptionConfig.transcription!,
          transport: 'audio-chat',
          chatProtocol: 'openai',
          structuredOutput: 'json_object',
        },
      },
      recognition: { mode: 'transcribe', granularity: 'sentence', prompt: '' },
    })
  ).rejects.toThrow('invalid-request');
  expect(post).toHaveBeenCalledOnce();
});

it.each([0, Number.POSITIVE_INFINITY, 800])(
  'refuses unsupported private audio duration %s before POST',
  async (durationSeconds) => {
    const post = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', post);
    await expect(
      requestTranscription({
        config: transcriptionConfig,
        input: privateTranscriptionInput(),
        durationSeconds,
        signal: new AbortController().signal,
        beforeSend: async () => {},
        onReceiving() {},
      })
    ).rejects.toThrow('too-large');
    expect(post).not.toHaveBeenCalled();
  }
);
