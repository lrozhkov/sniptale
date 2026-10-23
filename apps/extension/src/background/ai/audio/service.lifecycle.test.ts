import { afterEach, expect, it, vi } from 'vitest';
import { createAudioJobService } from './service';
import { requestAudio } from './request';
import {
  AUDIO_JOB_TIMEOUT_MS,
  type AudioJobServerMessage,
  type AudioJobStart,
} from '../../../contracts/ai/audio';
import type { AudioModelConfig } from './model-config';
const ticket = '12345678-1234-4234-8234-123456789abc';
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
  modelId: 'm',
  operation: 'speech',
  scope,
  phraseId: 'p',
  textRevision: 1,
  text: 'hello',
  profile: { voiceId: 'voice', responseFormat: 'mp3' },
};
const transcription: AudioJobStart = {
  type: 'start',
  requestId: 'r',
  modelId: 'm',
  operation: 'transcription',
  scope,
};
const config: AudioModelConfig = {
  url: 'https://example.test/audio/speech',
  apiKey: 'fixture',
  modelCode: 'm',
  speech: speech.profile,
  transcription: { responseFormat: 'json', timestampGranularity: 'none' },
};
const output = { id: ticket, mimeType: 'audio/mpeg' as const, size: 4 };

function wav(): File {
  const bytes = new Uint8Array(32044);
  const view = new DataView(bytes.buffer);
  const put = (at: number, value: string) => bytes.set(new TextEncoder().encode(value), at);
  put(0, 'RIFF');
  put(8, 'WAVE');
  put(12, 'fmt ');
  put(36, 'data');
  view.setUint32(4, 32036, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, 32000, true);
  return new File([bytes], 'audio.wav', { type: 'audio/wav' });
}
function setup(consumer: import('./authorization').AudioJobConsumer = 'gallery') {
  const deps = {
    authorize: vi.fn(async (): Promise<void> => undefined),
    resolveModel: vi.fn(async () => config),
    request: vi.fn<typeof requestAudio>(async () => ({
      kind: 'audio',
      blob: new Blob(['data'], { type: 'audio/mpeg' }),
    })),
    read: vi.fn(async () => wav()),
    write: vi.fn(async () => output),
    discard: vi.fn(async () => undefined),
    createId: () => ticket,
  };
  const service = createAudioJobService(deps);
  const messages: AudioJobServerMessage[] = [];
  const connection = service.connect((message) => messages.push(message), consumer);
  return { deps, service, messages, connection };
}
async function authorized(job: ReturnType<typeof setup>) {
  job.connection.receive(transcription);
  await vi.waitFor(() =>
    expect(job.messages.some((message) => message.type === 'authorized')).toBe(true)
  );
}
function execute(job: ReturnType<typeof setup>) {
  job.connection.receive({
    type: 'execute',
    requestId: 'r',
    ticket,
    staged: { id: ticket, mimeType: 'audio/wav', size: 32044 },
  });
}
afterEach(() => vi.useRealTimers());

it('voices authored text through the same cancellable job without preparing an audio upload', async () => {
  const job = setup();
  const textScope = {
    workspaceId: 'w',
    workspaceRevision: 1,
    target: { kind: 'text' as const, fragmentId: 'p' },
    textRevision: 1,
    timingRevision: 0,
    start: 0,
    end: 2,
    timeDomain: 'result' as const,
  };
  job.connection.receive({ ...speech, scope: textScope });
  await vi.waitFor(() =>
    expect(job.messages).toContainEqual({ type: 'audio', requestId: 'r', staged: output })
  );
  expect(job.deps.read).not.toHaveBeenCalled();
  expect(job.deps.request).toHaveBeenCalledOnce();
  expect(job.deps.request.mock.calls[0]?.[0].input).toBeUndefined();
  expect(job.deps.write).toHaveBeenCalledWith(expect.objectContaining({ scope: textScope }));
  expect(job.deps.authorize).toHaveBeenCalledTimes(4);
  await job.connection.disconnect();
});

it('stages speech only after post-response authority and delivers its scoped handle', async () => {
  const job = setup();
  job.deps.request.mockImplementationOnce(async (args) => {
    args.onReceiving();
    return { kind: 'audio', blob: new Blob(['data'], { type: 'audio/mpeg' }) };
  });
  job.connection.receive(speech);
  await vi.waitFor(() =>
    expect(job.messages).toContainEqual({ type: 'audio', requestId: 'r', staged: output })
  );
  expect(job.deps.authorize).toHaveBeenCalledTimes(4);
  expect(job.deps.authorize).toHaveBeenCalledBefore(job.deps.write);
  expect(job.messages).toContainEqual({ type: 'progress', requestId: 'r', phase: 'receiving' });
  await job.connection.disconnect();
  expect(job.deps.discard).not.toHaveBeenCalled();
});
it('runs an issued upload once and removes input after transcript delivery', async () => {
  const job = setup();
  job.deps.request.mockResolvedValueOnce({ kind: 'transcript', result: { text: 'hello' } });
  await authorized(job);
  execute(job);
  await vi.waitFor(() =>
    expect(job.messages).toContainEqual({
      type: 'transcript',
      requestId: 'r',
      result: { text: 'hello' },
    })
  );
  expect(job.deps.discard).toHaveBeenCalledOnce();
  execute(job);
  expect(job.deps.request).toHaveBeenCalledOnce();
  await job.connection.disconnect();
});
it('rejects execute before authorization or a mismatched ticket and never posts', async () => {
  const empty = setup();
  execute(empty);
  expect(empty.messages).toContainEqual({
    type: 'failure',
    requestId: 'r',
    code: 'invalid-request',
  });
  await empty.connection.disconnect();
  const job = setup();
  await authorized(job);
  job.connection.receive({
    type: 'execute',
    requestId: 'r',
    ticket: 'wrong',
    staged: { id: ticket, mimeType: 'audio/wav', size: 44 },
  });
  expect(job.messages).toContainEqual({ type: 'failure', requestId: 'r', code: 'invalid-request' });
  expect(job.deps.request).not.toHaveBeenCalled();
  await job.connection.disconnect();
});
it('ignores cancellation for another request and all messages after disconnect', async () => {
  const job = setup();
  job.connection.receive({ type: 'cancel', requestId: 'missing' });
  await authorized(job);
  job.connection.receive({ type: 'cancel', requestId: 'other' });
  expect(job.messages.filter((message) => message.type === 'failure')).toHaveLength(0);
  job.connection.receive({ type: 'cancel', requestId: 'r' });
  expect(job.messages).toContainEqual({ type: 'failure', requestId: 'r', code: 'cancelled' });
  await job.connection.disconnect();
  const count = job.messages.length;
  job.connection.receive(speech);
  expect(job.messages).toHaveLength(count);
});
it('rejects changed model configuration, invalid WAV and generic provider failure without retry', async () => {
  const stale = setup();
  stale.deps.resolveModel
    .mockResolvedValueOnce(config)
    .mockResolvedValueOnce({ ...config, modelCode: 'changed' });
  stale.connection.receive(speech);
  await vi.waitFor(() =>
    expect(stale.messages).toContainEqual({ type: 'failure', requestId: 'r', code: 'stale' })
  );
  expect(stale.deps.request).not.toHaveBeenCalled();
  const invalid = setup();
  invalid.deps.read.mockResolvedValueOnce(new File(['bad'], 'audio.wav', { type: 'audio/wav' }));
  await authorized(invalid);
  execute(invalid);
  await vi.waitFor(() =>
    expect(invalid.messages).toContainEqual({
      type: 'failure',
      requestId: 'r',
      code: 'invalid-request',
    })
  );
  expect(invalid.deps.request).not.toHaveBeenCalled();
  expect(invalid.deps.discard).toHaveBeenCalledOnce();
  const failed = setup();
  failed.deps.request.mockRejectedValueOnce(new Error('private upstream detail'));
  failed.connection.receive(speech);
  await vi.waitFor(() =>
    expect(failed.messages).toContainEqual({
      type: 'failure',
      requestId: 'r',
      code: 'provider-failed',
    })
  );
  expect(failed.deps.request).toHaveBeenCalledOnce();
  await Promise.all([
    stale.connection.disconnect(),
    invalid.connection.disconnect(),
    failed.connection.disconnect(),
  ]);
});
it('reports storage failure and discards output if cancellation wins during staging', async () => {
  const failed = setup();
  failed.deps.write.mockRejectedValueOnce(new Error('quota'));
  failed.connection.receive(speech);
  await vi.waitFor(() =>
    expect(failed.messages).toContainEqual({
      type: 'failure',
      requestId: 'r',
      code: 'storage-failed',
    })
  );
  const cancelled = setup();
  cancelled.deps.write.mockImplementationOnce(async () => {
    cancelled.connection.receive({ type: 'cancel', requestId: 'r' });
    return output;
  });
  cancelled.connection.receive(speech);
  await vi.waitFor(() =>
    expect(cancelled.messages).toContainEqual({
      type: 'failure',
      requestId: 'r',
      code: 'cancelled',
    })
  );
  expect(cancelled.deps.discard).toHaveBeenCalledWith(output, scope);
  await Promise.all([failed.connection.disconnect(), cancelled.connection.disconnect()]);
});
it('expires an idle authorized ticket and an in-flight response without replay', async () => {
  const idle = setup();
  vi.useFakeTimers();
  idle.connection.receive(transcription);
  await vi.advanceTimersByTimeAsync(1);
  await vi.advanceTimersByTimeAsync(AUDIO_JOB_TIMEOUT_MS);
  expect(idle.messages).toContainEqual({ type: 'failure', requestId: 'r', code: 'timeout' });
  expect(idle.deps.request).not.toHaveBeenCalled();
  const running = setup();
  running.deps.request.mockImplementationOnce(
    async ({ signal }) =>
      new Promise<never>((_, reject) =>
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      )
  );
  running.connection.receive(speech);
  await vi.advanceTimersByTimeAsync(1);
  await vi.advanceTimersByTimeAsync(AUDIO_JOB_TIMEOUT_MS);
  expect(running.messages).toContainEqual({ type: 'failure', requestId: 'r', code: 'timeout' });
  await Promise.all([idle.connection.disconnect(), running.connection.disconnect()]);
});
it('cancels pending admission before secret resolution and releases erasure exactly once', async () => {
  const job = setup();
  let resolve!: () => void;
  job.deps.authorize.mockReturnValueOnce(
    new Promise<void>((done) => {
      resolve = done;
    })
  );
  job.connection.receive(speech);
  const disconnected = job.connection.disconnect();
  resolve();
  await disconnected;
  expect(job.deps.resolveModel).not.toHaveBeenCalled();
  const exclusion = job.service.reserveErasureExclusion();
  await job.service.cancelActiveJob();
  await exclusion.waitForActiveMutations();
  exclusion.release();
  exclusion.release();
  const next: AudioJobServerMessage[] = [];
  const newConnection = job.service.connect((message) => next.push(message));
  newConnection.receive(speech);
  await vi.waitFor(() => expect(next.some((message) => message.type === 'audio')).toBe(true));
  await newConnection.disconnect();
});

it('retries retained upload cleanup during erasure after a completed request cleanup fails', async () => {
  const job = setup();
  job.deps.request.mockResolvedValueOnce({ kind: 'transcript', result: { text: 'hello' } });
  job.deps.discard.mockRejectedValueOnce(new Error('temporary removal failure'));
  await authorized(job);
  execute(job);
  await vi.waitFor(() => expect(job.deps.discard).toHaveBeenCalledTimes(1));
  const reservation = job.service.reserveErasureExclusion();
  await expect(job.service.cancelActiveJob()).resolves.toBeUndefined();
  expect(job.deps.discard).toHaveBeenCalledTimes(2);
  await reservation.waitForActiveMutations();
  reservation.release();
  await job.connection.disconnect();
});

it('cleans the authorized transcription upload after a network failure without retrying', async () => {
  const job = setup();
  job.deps.request.mockRejectedValueOnce(new Error('network-failed'));
  await authorized(job);
  execute(job);
  await vi.waitFor(() =>
    expect(job.messages).toContainEqual({ type: 'failure', requestId: 'r', code: 'network-failed' })
  );
  expect(job.deps.discard).toHaveBeenCalledOnce();
  expect(job.deps.write).not.toHaveBeenCalled();
  expect(job.deps.request).toHaveBeenCalledOnce();
  await job.connection.disconnect();
});

it('original tickets reauthorize after staged input and cannot execute again or survive erasure', async () => {
  const original: AudioJobStart = {
    ...transcription,
    scope: { ...scope, target: { kind: 'original' } },
  };
  const stale = setup();
  stale.connection.receive(original);
  await vi.waitFor(() =>
    expect(stale.messages).toContainEqual({
      type: 'authorized',
      requestId: 'r',
      ticket,
      scope: original.scope,
    })
  );
  stale.deps.read.mockImplementationOnce(async () => {
    stale.deps.authorize.mockRejectedValue(new Error('stale'));
    return wav();
  });
  execute(stale);
  await vi.waitFor(() =>
    expect(stale.messages).toContainEqual({ type: 'failure', requestId: 'r', code: 'stale' })
  );
  expect(stale.deps.read).toHaveBeenCalledWith(expect.anything(), original.scope);
  expect(stale.deps.request).not.toHaveBeenCalled();
  execute(stale);
  expect(stale.deps.request).not.toHaveBeenCalled();
  await stale.connection.disconnect();
  const erased = setup();
  erased.connection.receive(original);
  await vi.waitFor(() => expect(erased.messages.some((m) => m.type === 'authorized')).toBe(true));
  const exclusion = erased.service.reserveErasureExclusion();
  await erased.service.cancelActiveJob();
  await exclusion.waitForActiveMutations();
  execute(erased);
  const denied: AudioJobServerMessage[] = [];
  erased.service.connect((message) => denied.push(message)).receive(original);
  expect(denied).toContainEqual({ type: 'failure', requestId: 'r', code: 'unauthorized' });
  expect(erased.deps.request).not.toHaveBeenCalled();
  exclusion.release();
  await erased.connection.disconnect();
});
it('binds keepalive to the active request and never extends authorization or the job deadline', async () => {
  vi.useFakeTimers();
  const idle = setup();
  idle.connection.receive({ type: 'keepalive', requestId: 'r' });
  expect(idle.messages).toEqual([{ type: 'failure', requestId: 'r', code: 'unauthorized' }]);
  expect(idle.deps.authorize).not.toHaveBeenCalled();
  const job = setup();
  job.connection.receive(transcription);
  await vi.advanceTimersByTimeAsync(1);
  for (let index = 0; index < 5; index++) {
    await vi.advanceTimersByTimeAsync(20_000);
    job.connection.receive({ type: 'keepalive', requestId: 'r' });
  }
  expect(job.messages.filter((message) => message.type === 'failure')).toEqual([]);
  expect(job.deps.request).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(20_000);
  expect(job.messages).toContainEqual({ type: 'failure', requestId: 'r', code: 'timeout' });
  job.connection.receive({ type: 'keepalive', requestId: 'r' });
  expect(job.messages.at(-1)).toEqual({ type: 'failure', requestId: 'r', code: 'unauthorized' });
  expect(job.deps.authorize).toHaveBeenCalledOnce();
  await Promise.all([idle.connection.disconnect(), job.connection.disconnect()]);
});

it('project tickets refuse stale uploads before POST and cannot replay', async () => {
  const projectRequest: AudioJobStart = {
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
  };
  const job = setup('project');
  job.connection.receive(projectRequest);
  await vi.waitFor(() =>
    expect(job.messages).toContainEqual({
      type: 'authorized',
      requestId: 'r',
      ticket,
      scope: projectRequest.scope,
    })
  );
  job.deps.read.mockImplementationOnce(async () => {
    job.deps.authorize.mockRejectedValue(new Error('stale'));
    return wav();
  });
  execute(job);
  await vi.waitFor(() =>
    expect(job.messages).toContainEqual({ type: 'failure', requestId: 'r', code: 'stale' })
  );
  expect(job.deps.read).toHaveBeenCalledWith(expect.anything(), projectRequest.scope);
  expect(job.deps.discard).toHaveBeenCalledWith(expect.anything(), projectRequest.scope);
  expect(job.deps.request).not.toHaveBeenCalled();
  execute(job);
  expect(job.deps.request).not.toHaveBeenCalled();
  await job.connection.disconnect();
});

it('runs project transcription through the existing upload and cleanup lifecycle', async () => {
  const projectRequest: AudioJobStart = {
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
  };
  const job = setup('project');
  job.deps.request.mockResolvedValueOnce({
    kind: 'transcript',
    result: { text: 'Project speech' },
  });
  job.connection.receive(projectRequest);
  await vi.waitFor(() =>
    expect(job.messages.some((message) => message.type === 'authorized')).toBe(true)
  );
  execute(job);
  await vi.waitFor(() =>
    expect(job.messages).toContainEqual({
      type: 'transcript',
      requestId: 'r',
      result: { text: 'Project speech' },
    })
  );
  expect(job.deps.request).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ request: projectRequest, input: expect.any(File) })
  );
  expect(job.deps.discard).toHaveBeenCalledOnce();
  execute(job);
  expect(job.deps.request).toHaveBeenCalledOnce();
  await job.connection.disconnect();
});

it('enforces the bound consumer even when the Port parser is bypassed', async () => {
  const scenario = {
    type: 'start' as const,
    requestId: 'scenario',
    operation: 'speech' as const,
    modelId: 'model',
    approvedProviderId: 'provider',
    text: 'Saved action',
    profile: speech.profile,
    scope: {
      workspaceId: 'scenario',
      workspaceRevision: 1,
      target: { kind: 'scenario-text' as const, slideId: 'slide', objectId: 'action' },
      sourceTextHash: 'a'.repeat(64),
    },
  };
  const job = setup();
  job.connection.receive(scenario);
  expect(job.messages).toContainEqual({
    type: 'failure',
    requestId: 'scenario',
    code: 'unauthorized',
  });
  expect(job.deps.authorize).not.toHaveBeenCalled();
  const scenarioMessages: AudioJobServerMessage[] = [];
  const scenarioConnection = job.service.connect(
    (message) => scenarioMessages.push(message),
    'scenario'
  );
  scenarioConnection.receive(speech);
  scenarioConnection.receive(transcription);
  expect(scenarioMessages).toEqual([
    { type: 'failure', requestId: 'r', code: 'unauthorized' },
    { type: 'failure', requestId: 'r', code: 'unauthorized' },
  ]);
  expect(job.deps.resolveModel).not.toHaveBeenCalled();
  scenarioConnection.receive(scenario);
  await vi.waitFor(() =>
    expect(scenarioMessages.some((message) => message.type === 'audio')).toBe(true)
  );
  expect(job.deps.request).toHaveBeenCalledOnce();
  await Promise.all([job.connection.disconnect(), scenarioConnection.disconnect()]);
});

it('rejects Scenario speech after backup replacement changes its saved source', async () => {
  const job = setup();
  let replaced = false;
  job.deps.authorize.mockImplementation(async () => {
    if (replaced) throw new Error('stale');
  });
  let release!: (value: Awaited<ReturnType<typeof requestAudio>>) => void;
  job.deps.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const connection = job.service.connect((message) => job.messages.push(message), 'scenario');
  connection.receive({
    type: 'start',
    requestId: 'scenario',
    modelId: 'm',
    approvedProviderId: 'provider',
    operation: 'speech',
    text: 'Saved action',
    profile: speech.profile,
    scope: {
      workspaceId: 'scenario',
      workspaceRevision: 1,
      target: { kind: 'scenario-text', slideId: 'slide', objectId: 'action' },
      sourceTextHash: 'a'.repeat(64),
    },
  });
  await vi.waitFor(() => expect(job.deps.request).toHaveBeenCalledOnce());
  replaced = true;
  release({ kind: 'audio', blob: new Blob(['voice'], { type: 'audio/mpeg' }) });
  await vi.waitFor(() =>
    expect(job.messages).toContainEqual({ type: 'failure', requestId: 'scenario', code: 'stale' })
  );
  expect(job.deps.write).not.toHaveBeenCalled();
  expect(job.messages.some((message) => message.type === 'audio')).toBe(false);
  await connection.disconnect();
});
