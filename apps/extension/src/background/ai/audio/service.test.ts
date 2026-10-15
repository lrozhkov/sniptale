import { authorizeAudioJob } from './authorization';
import { readVideoWorkspace } from '../../../composition/persistence/review-workspaces/store';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
vi.mock('../../../composition/persistence/review-workspaces/store', () => ({
  readVideoWorkspace: vi.fn(),
}));
vi.mock('../../../composition/persistence/projects', () => ({
  getProjectAsset: vi.fn(async () => ({ status: 'ready' })),
}));
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioJobService } from './service';
import { requestAudio } from './request';
import type { AudioJobServerMessage, AudioJobStart } from '../../../contracts/ai/audio';
const request: AudioJobStart = {
  type: 'start',
  requestId: 'request',
  operation: 'speech',
  modelId: 'model',
  scope: {
    workspaceId: 'w',
    workspaceRevision: 1,
    target: { kind: 'voiceover' as const, clipId: 'c' },
    assetId: 'a',
    nativeStart: 0,
    nativeEnd: 1,
  },
  phraseId: 'p',
  textRevision: 1,
  text: 'hello',
  profile: { voiceId: 'voice', responseFormat: 'mp3' },
};
const config = {
  url: 'https://example.test/v1/audio/speech',
  apiKey: 'test-secret',
  modelCode: 'speech',
  speech: request.profile,
};
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('one-shot audio jobs', () => {
  it('does not egress on stale scope and never retries a failure', async () => {
    const post = vi.fn().mockRejectedValue(new Error('provider-rate-limit'));
    const service = createAudioJobService({
      authorize: vi.fn(async () => undefined),
      resolveModel: vi.fn(async () => config),
      request: post,
    });
    const messages: AudioJobServerMessage[] = [];
    const connection = service.connect((message) => messages.push(message));
    connection.receive(request);
    await vi.waitFor(() =>
      expect(messages.some((message) => message.type === 'failure')).toBe(true)
    );
    expect(post).toHaveBeenCalledTimes(1);
    connection.receive(request);
    expect(post).toHaveBeenCalledTimes(1);
    const denied = createAudioJobService({
      authorize: vi.fn(async () => {
        throw new Error('stale');
      }),
      request: post,
    });
    const other = denied.connect(() => undefined);
    other.receive(request);
    await other.disconnect();
    expect(post).toHaveBeenCalledTimes(1);
  });
  it('aborts active response on disconnect and reserves erasure before accepting work', async () => {
    let signal: AbortSignal | undefined;
    const post = vi.fn(async (args: Parameters<typeof requestAudio>[0]) => {
      signal = args.signal;
      return new Promise<never>((_, reject) =>
        args.signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError'))
        )
      );
    });
    const service = createAudioJobService({
      authorize: vi.fn(async () => undefined),
      resolveModel: vi.fn(async () => config),
      request: post,
    });
    const connection = service.connect(() => undefined);
    connection.receive(request);
    await vi.waitFor(() => expect(signal).toBeDefined());
    await connection.disconnect();
    expect(signal?.aborted).toBe(true);
    const reservation = service.reserveErasureExclusion();
    const messages: AudioJobServerMessage[] = [];
    service.connect((message) => messages.push(message)).receive(request);
    expect(messages).toContainEqual({
      type: 'failure',
      requestId: 'request',
      code: 'unauthorized',
    });
    await service.cancelActiveJob();
    await reservation.waitForActiveMutations();
    reservation.release();
  });
});
it('never forwards provider error bodies and uses redirect rejection', async () => {
  const fetchMock = vi.fn<typeof fetch>(
    async () => new Response('sensitive upstream body', { status: 429 })
  );
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    requestAudio({ request, config, signal: new AbortController().signal, onReceiving() {} })
  ).rejects.toThrow('provider-rate-limit');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
    redirect: 'error',
    credentials: 'omit',
    cache: 'no-store',
  });
});
it('rejects malformed MIME and oversized bodies before returning audio', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('not audio', { headers: { 'Content-Type': 'text/html' } }))
  );
  await expect(
    requestAudio({ request, config, signal: new AbortController().signal, onReceiving() {} })
  ).rejects.toThrow('invalid-response');
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response('bytes', {
          headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '999999999' },
        })
    )
  );
  await expect(
    requestAudio({ request, config, signal: new AbortController().signal, onReceiving() {} })
  ).rejects.toThrow('too-large');
});

it('ready transcription is cancelled explicitly on erasure and tickets are single-use', async () => {
  const post = vi.fn();
  const service = createAudioJobService({
    authorize: vi.fn(async () => undefined),
    resolveModel: vi.fn(async () => ({
      ...config,
      transcription: { responseFormat: 'json' as const, timestampGranularity: 'none' as const },
    })),
    request: post,
  });
  const messages: AudioJobServerMessage[] = [];
  const connection = service.connect((message) => messages.push(message));
  connection.receive({
    type: 'start',
    requestId: 'r',
    modelId: 'm',
    operation: 'transcription',
    scope: request.scope,
  });
  await vi.waitFor(() =>
    expect(messages.some((message) => message.type === 'authorized')).toBe(true)
  );
  const exclusion = service.reserveErasureExclusion();
  await service.cancelActiveJob();
  expect(messages).toContainEqual({ type: 'failure', requestId: 'r', code: 'cancelled' });
  await exclusion.waitForActiveMutations();
  exclusion.release();
  connection.receive({
    type: 'start',
    requestId: 'r',
    modelId: 'm',
    operation: 'transcription',
    scope: request.scope,
  });
  expect(post).not.toHaveBeenCalled();
  await connection.disconnect();
});

it('authorizes replayed trimmed native spans and excludes cut material', async () => {
  const advanced = createQuickEditAdvancedState();
  advanced.audio.voiceover = [
    {
      id: 'c',
      assetId: 'project-asset:a',
      timelineStart: 0,
      sourceOffset: 5,
      duration: 4,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      sourceAnchor: [
        { start: 0, end: 2, offset: 0, duration: 2 },
        { start: 2, end: 4, offset: 2, duration: 2 },
      ],
    },
  ];
  const workspace = {
    aggregateId: 'w',
    formatVersion: 1 as const,
    source: { duration: 4, width: 10, height: 10, mimeType: 'video/webm', size: 10 },
    sourceAssetId: 'source',
    revision: 1,
    history: [],
    cursor: 0,
    advanced,
    createdAt: 1,
    updatedAt: 1,
  };
  vi.mocked(readVideoWorkspace).mockResolvedValue({ workspace, draft: null });
  const start: AudioJobStart = {
    type: 'start',
    operation: 'transcription',
    requestId: 'r',
    modelId: 'm',
    scope: { ...request.scope, assetId: 'project-asset:a', nativeStart: 5, nativeEnd: 9 },
  };
  await expect(authorizeAudioJob(start)).resolves.toBeUndefined();
  await expect(
    authorizeAudioJob({ ...start, scope: { ...start.scope, nativeStart: 0, nativeEnd: 1 } })
  ).rejects.toThrow('unauthorized');
  vi.mocked(readVideoWorkspace).mockResolvedValue({
    workspace: {
      ...workspace,
      cursor: 1,
      history: [
        {
          id: 'op',
          at: 1,
          target: 'edit',
          before: null,
          preserveVoiceoverAnchors: true,
          preserveUnderCuts: true,
          after: { id: 'cut', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 },
        },
      ],
    },
    draft: null,
  });
  await expect(
    authorizeAudioJob({ ...start, scope: { ...start.scope, nativeStart: 6, nativeEnd: 7 } })
  ).rejects.toThrow('unauthorized');
  await expect(
    authorizeAudioJob({ ...start, scope: { ...start.scope, nativeStart: 7, nativeEnd: 9 } })
  ).resolves.toBeUndefined();
});

it('sends prepared browser multipart and returns validated chunk-relative timings', async () => {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({ text: 'hello', words: [{ word: 'hello', start: 0, end: 1 }] }),
        { headers: { 'Content-Type': 'application/json' } }
      )
  );
  vi.stubGlobal('fetch', fetchMock);
  const result = await requestAudio({
    request: {
      type: 'start',
      requestId: 'r',
      modelId: 'm',
      operation: 'transcription',
      scope: request.scope,
    },
    config: {
      ...config,
      transcription: {
        responseFormat: 'verbose_json',
        timestampGranularity: 'word',
        language: 'en',
      },
    },
    input: new File(['bytes'], 'audio.wav', { type: 'audio/wav' }),
    signal: new AbortController().signal,
    onReceiving() {},
  });
  expect(result).toEqual({
    kind: 'transcript',
    result: { text: 'hello', words: [{ text: 'hello', start: 0, end: 1 }] },
  });
  const init = fetchMock.mock.calls[0]?.[1];
  expect(init?.body).toBeInstanceOf(ArrayBuffer);
  const form = await new Response(init?.body, { headers: new Headers(init?.headers) }).formData();
  expect(form.get('timestamp_granularities[]')).toBe('word');
  expect(form.get('file')).toBeInstanceOf(File);
});

it('returns bounded binary speech and honours an abort while reading its response', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async () =>
        new Response(new Uint8Array([73, 68, 51, 0]), { headers: { 'Content-Type': 'audio/mpeg' } })
    )
  );
  const controller = new AbortController();
  const result = await requestAudio({
    request,
    config,
    signal: controller.signal,
    onReceiving() {},
  });
  expect(result.kind).toBe('audio');
  if (result.kind === 'audio') expect(result.blob.type).toBe('audio/mpeg');
  await expect(
    requestAudio({
      request,
      config,
      signal: controller.signal,
      onReceiving() {
        controller.abort();
      },
    })
  ).rejects.toThrow();
});

it.each([
  [new Error('network-failed'), 'network-failed'],
  [new Error('provider-request'), 'provider-request'],
  [new Error('provider-not-found'), 'provider-not-found'],
  [new Error('secret-unavailable'), 'secret-unavailable'],
  [new Error('private upstream detail'), 'provider-failed'],
  [{ secret: 'private rejected payload' }, 'provider-failed'],
] as const)('sends only admitted diagnostic codes on failure %#', async (cause, code) => {
  const post = vi.fn().mockRejectedValue(cause);
  const messages: AudioJobServerMessage[] = [];
  const service = createAudioJobService({
    authorize: vi.fn(async () => undefined),
    resolveModel: vi.fn(async () => config),
    request: post,
  });
  const connection = service.connect((message) => messages.push(message));
  connection.receive(request);
  await vi.waitFor(() =>
    expect(messages).toContainEqual({ type: 'failure', requestId: 'request', code })
  );
  expect(JSON.stringify(messages)).not.toContain('private');
  expect(post).toHaveBeenCalledOnce();
  await connection.disconnect();
});

it('publishes PCM only as a WAV staging handle through the real request implementation', async () => {
  const pcmRequest: AudioJobStart = {
    ...request,
    profile: { ...request.profile, responseFormat: 'pcm' },
  };
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(new Uint8Array([0, 128, 255, 127]), {
        headers: { 'Content-Type': 'audio/pcm' },
      })
  );
  vi.stubGlobal('fetch', fetchMock);
  const write = vi.fn(async ({ blob }: { blob: Blob }) => {
    expect(blob.type).toBe('audio/wav');
    expect(new TextDecoder().decode(await blob.slice(0, 4).arrayBuffer())).toBe('RIFF');
    return {
      id: '12345678-1234-4234-8234-123456789abc',
      mimeType: 'audio/wav' as const,
      size: blob.size,
    };
  });
  const service = createAudioJobService({
    authorize: vi.fn(async () => undefined),
    resolveModel: vi.fn(async () => ({ ...config, speech: pcmRequest.profile })),
    write,
  });
  const messages: AudioJobServerMessage[] = [];
  const connection = service.connect((message) => messages.push(message));
  connection.receive(pcmRequest);
  await vi.waitFor(() =>
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'audio',
        staged: expect.objectContaining({ mimeType: 'audio/wav', size: 48 }),
      })
    )
  );
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(write).toHaveBeenCalledOnce();
  await connection.disconnect();
});
