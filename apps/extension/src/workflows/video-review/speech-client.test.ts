import { afterEach, expect, it, vi } from 'vitest';
import { runReviewSpeechJob } from './speech-client';
vi.mock('../../composition/persistence/assets/audio-staging', () => ({
  writeAudioStaging: staging.write,
  discardAudioStaging: staging.discard,
}));
afterEach(() => vi.unstubAllGlobals());
it('reports worker interruption without automatically replaying the paid request', async () => {
  const listeners: (() => void)[] = [];
  const postMessage = vi.fn();
  const connect = vi.fn(() => ({
    postMessage,
    disconnect: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: (listener: () => void) => listeners.push(listener) },
  }));
  vi.stubGlobal('chrome', { runtime: { connect } });
  const request = runReviewSpeechJob(
    {
      type: 'start',
      requestId: 'request',
      modelId: 'model',
      operation: 'transcription',
      scope: {
        workspaceId: 'workspace',
        workspaceRevision: 1,
        target: { kind: 'voiceover' as const, clipId: 'clip' },
        assetId: 'asset',
        nativeStart: 0,
        nativeEnd: 2,
      },
    },
    { signal: new AbortController().signal }
  );
  listeners[0]!();
  await expect(request).rejects.toThrow('interrupted');
  expect(connect).toHaveBeenCalledTimes(1);
  expect(postMessage).toHaveBeenCalledTimes(1);
});
it('propagates cancellation to the worker and rejects instead of publishing a late result', async () => {
  const postMessage = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: {
      connect: () => ({
        postMessage,
        disconnect: vi.fn(),
        onMessage: { addListener: vi.fn() },
        onDisconnect: { addListener: vi.fn() },
      }),
    },
  });
  const controller = new AbortController();
  const request = runReviewSpeechJob(
    {
      type: 'start',
      requestId: 'request',
      modelId: 'model',
      operation: 'transcription',
      scope: {
        workspaceId: 'workspace',
        workspaceRevision: 1,
        target: { kind: 'voiceover' as const, clipId: 'clip' },
        assetId: 'asset',
        nativeStart: 0,
        nativeEnd: 2,
      },
    },
    { signal: controller.signal }
  );
  controller.abort();
  await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  expect(postMessage).toHaveBeenLastCalledWith({ type: 'cancel', requestId: 'request' });
});

const staging = vi.hoisted(() => ({ write: vi.fn(), discard: vi.fn(async () => undefined) }));
function connectedJob() {
  let receive!: (message: unknown) => void;
  let disconnect!: () => void;
  const postMessage = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: {
      connect: () => ({
        postMessage,
        disconnect: vi.fn(),
        onMessage: {
          addListener: (fn: typeof receive) => {
            receive = fn;
          },
        },
        onDisconnect: {
          addListener: (fn: typeof disconnect) => {
            disconnect = fn;
          },
        },
      }),
    },
  });
  const scope = {
    workspaceId: 'workspace',
    workspaceRevision: 1,
    target: { kind: 'voiceover' as const, clipId: 'clip' },
    assetId: 'asset',
    nativeStart: 0,
    nativeEnd: 2,
  };
  const start = {
    type: 'start' as const,
    requestId: 'r',
    modelId: 'm',
    operation: 'transcription' as const,
    scope,
  };
  return {
    receive: (value: unknown) => receive(value),
    disconnect: () => disconnect(),
    postMessage,
    start,
  };
}
it('finishes confirmed silence after authorization without staging or executing a paid request', async () => {
  staging.write.mockClear();
  const job = connectedJob();
  const pending = runReviewSpeechJob(job.start, {
    signal: new AbortController().signal,
    prepareInput: async () => null,
  });
  void pending.catch(() => undefined);
  try {
    expect(staging.write).not.toHaveBeenCalled();
    job.receive({
      type: 'authorized',
      requestId: 'r',
      ticket: '11111111-1111-4111-8111-111111111111',
      scope: job.start.scope,
    });
    await vi.waitFor(() =>
      expect(job.postMessage).toHaveBeenLastCalledWith({ type: 'cancel', requestId: 'r' })
    );
    await expect(pending).resolves.toEqual({ type: 'transcript', result: { text: '' } });
    expect(staging.write).not.toHaveBeenCalled();
    expect(job.postMessage).toHaveBeenCalledTimes(2);
  } finally {
    job.disconnect();
  }
});
it('uploads once, ignores other request identities and publishes a typed transcript', async () => {
  const job = connectedJob();
  const id = '11111111-1111-4111-8111-111111111111';
  staging.write.mockResolvedValue({ id, mimeType: 'audio/wav', size: 44 });
  const prepareInput = vi.fn(async () => new Blob(['pcm'], { type: 'audio/wav' }));
  const pending = runReviewSpeechJob(job.start, {
    signal: new AbortController().signal,
    prepareInput,
  });
  job.receive({ type: 'progress', requestId: 'other', phase: 'requesting' });
  job.receive({ type: 'authorized', requestId: 'r', ticket: id, scope: job.start.scope });
  await vi.waitFor(() => expect(job.postMessage).toHaveBeenCalledTimes(2));
  expect(prepareInput).toHaveBeenCalledOnce();
  job.receive({ type: 'transcript', requestId: 'r', result: { text: 'Hello' } });
  await expect(pending).resolves.toEqual({
    type: 'transcript',
    requestId: 'r',
    result: { text: 'Hello' },
  });
});
it.each([
  [{ type: 'failure', requestId: 'r', code: 'provider-rate-limit' }, 'provider-rate-limit'],
  [{ type: 'unrecognized', requestId: 'r' }, 'invalid-response'],
  [
    {
      type: 'audio',
      requestId: 'r',
      staged: { id: '11111111-1111-4111-8111-111111111111', mimeType: 'audio/wav', size: 44 },
    },
    'invalid-response',
  ],
])('rejects terminal protocol/provider failures without replay', async (message, reason) => {
  const job = connectedJob();
  const pending = runReviewSpeechJob(job.start, { signal: new AbortController().signal });
  job.receive(message);
  await expect(pending).rejects.toThrow(reason);
  expect(job.postMessage).toHaveBeenCalledTimes(1);
});
it('rejects authorization for a different scope before extraction', async () => {
  const job = connectedJob();
  const prepareInput = vi.fn();
  const pending = runReviewSpeechJob(job.start, {
    signal: new AbortController().signal,
    prepareInput,
  });
  job.receive({
    type: 'authorized',
    requestId: 'r',
    ticket: '11111111-1111-4111-8111-111111111111',
    scope: { ...job.start.scope, nativeEnd: 3 },
  });
  await expect(pending).rejects.toThrow('invalid-response');
  expect(prepareInput).not.toHaveBeenCalled();
});
it('discards a stage completed after worker disconnect rather than sending execute', async () => {
  const job = connectedJob();
  const id = '11111111-1111-4111-8111-111111111111';
  let finishWrite!: (value: { id: string; mimeType: string; size: number }) => void;
  staging.write.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishWrite = resolve;
      })
  );
  const pending = runReviewSpeechJob(job.start, {
    signal: new AbortController().signal,
    prepareInput: async () => new Blob(['pcm']),
  });
  job.receive({ type: 'authorized', requestId: 'r', ticket: id, scope: job.start.scope });
  await vi.waitFor(() => expect(finishWrite).toBeTypeOf('function'));
  job.disconnect();
  await expect(pending).rejects.toThrow('interrupted');
  finishWrite({ id, mimeType: 'audio/wav', size: 44 });
  await vi.waitFor(() => expect(staging.discard).toHaveBeenCalled());
  expect(job.postMessage).toHaveBeenCalledTimes(1);
});

it.each(['decode-failed', 'storage-failed'] as const)(
  'distinguishes %s before upload',
  async (code) => {
    const job = connectedJob();
    const id = '11111111-1111-4111-8111-111111111111';
    const prepareInput = vi.fn(async () => new Blob(['pcm'], { type: 'audio/wav' }));
    if (code === 'decode-failed')
      prepareInput.mockRejectedValueOnce(new Error('private decoder detail'));
    else staging.write.mockRejectedValueOnce(new Error('private storage detail'));
    const pending = runReviewSpeechJob(job.start, {
      signal: new AbortController().signal,
      prepareInput,
    });
    job.receive({ type: 'authorized', requestId: 'r', ticket: id, scope: job.start.scope });
    await expect(pending).rejects.toThrow(code);
    expect(job.postMessage).toHaveBeenCalledTimes(1);
  }
);
it('keeps only the active one-shot job alive and stops messages on cancellation', async () => {
  vi.useFakeTimers();
  const job = connectedJob();
  const controller = new AbortController();
  const promise = runReviewSpeechJob(job.start, { signal: controller.signal });
  const rejected = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  try {
    await vi.advanceTimersByTimeAsync(40_000);
    expect(job.postMessage.mock.calls.filter(([message]) => message.type === 'keepalive')).toEqual([
      [{ type: 'keepalive', requestId: 'r' }],
      [{ type: 'keepalive', requestId: 'r' }],
    ]);
    expect(job.postMessage.mock.calls.filter(([message]) => message.type === 'start')).toHaveLength(
      1
    );
  } finally {
    controller.abort();
    await rejected;
    const count = job.postMessage.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100_000);
    expect(job.postMessage).toHaveBeenCalledTimes(count);
    vi.useRealTimers();
  }
});
it('releases keepalive on a terminal response and failed initial delivery', async () => {
  vi.useFakeTimers();
  try {
    const success = connectedJob();
    const completed = runReviewSpeechJob(success.start, { signal: new AbortController().signal });
    success.receive({ type: 'transcript', requestId: 'r', result: { text: 'done' } });
    await expect(completed).resolves.toEqual({
      type: 'transcript',
      requestId: 'r',
      result: { text: 'done' },
    });
    expect(vi.getTimerCount()).toBe(0);
    const failure = connectedJob();
    failure.postMessage.mockImplementationOnce(() => {
      throw new Error('closed');
    });
    await expect(
      runReviewSpeechJob(failure.start, { signal: new AbortController().signal })
    ).rejects.toThrow('interrupted');
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
