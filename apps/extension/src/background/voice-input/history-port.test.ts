import { describe, expect, it, vi } from 'vitest';
import { VOICE_INPUT_HISTORY_PORT_NAME } from '@sniptale/runtime-contracts/voice-input';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import {
  createHistoryFixture,
  publish,
  deferred,
} from '../../composition/persistence/voice-input-history/test-support';
import { createVoiceInputHistoryPort } from './history-port';
import { createVoiceInputProcessingOperations } from './processing-operation';
import type { createVoiceInputProcessor } from './processing';

vi.mock('@sniptale/platform/browser/runtime', () => ({
  runtimeInfo: { getURL: (path: string) => `chrome-extension://extension-id/${path}` },
}));
function port(path = 'settings', frameId = 0) {
  return createRuntimePortFixture({
    name: VOICE_INPUT_HISTORY_PORT_NAME,
    sender: {
      documentId: 'document',
      frameId,
      url: `chrome-extension://extension-id/apps/extension/src/${path}/index.html`,
    },
  });
}
async function harness() {
  const history = createHistoryFixture().create();
  await history.initialize();
  const scope = await publish(history);
  const run = vi.fn<ReturnType<typeof createVoiceInputProcessor>['run']>();
  const processing = createVoiceInputProcessingOperations({
    history,
    processor: { run },
    acquirePermit: () => vi.fn(),
    getGeneration: () => 0,
  });
  const loadPreferences = vi.fn(async () => ({
    transcription: {
      modelId: 'model',
      approvedProviderId: 'provider',
      approvedDestination: 'sha256:' + 'a'.repeat(64),
      approvedModelCode: 'whisper',
    },
    backend: 'model' as const,
    language: 'ru-RU' as const,
    mode: 'local-first' as const,
    microphoneDeviceId: null,
  }));
  const owner = createVoiceInputHistoryPort({ history, processing, loadPreferences });
  return { history, scope, run, owner, loadPreferences };
}
async function flush() {
  for (let index = 0; index < 30; index += 1) await Promise.resolve();
}

describe('private Settings voice history Port', () => {
  it.each([
    ['gallery', 0],
    ['settings', 1],
  ])('rejects neighboring or child document %s frame %s', async (path, frame) => {
    const h = await harness();
    const candidate = port(path, frame);
    h.owner.registerPort(candidate.port);
    expect(candidate.disconnect).toHaveBeenCalledOnce();
    candidate.onMessage.emit({ type: 'list', requestId: 'denied' });
    expect(candidate.postMessage).not.toHaveBeenCalled();
  });
  it('lists metadata and rejects binary or extra-scope requests', async () => {
    const h = await harness();
    const client = port();
    h.owner.registerPort(client.port);
    client.onMessage.emit({ type: 'list', requestId: 'list' });
    await flush();
    expect(client.postMessage).toHaveBeenCalledWith({
      type: 'list',
      requestId: 'list',
      entries: await h.history.list(),
    });
    client.onMessage.emit({
      type: 'retry',
      requestId: 'invalid',
      scope: { ...h.scope, audio: new Blob(['private']) },
    });
    await flush();
    expect(h.run).not.toHaveBeenCalled();
  });
  it('cancels and drains retry before deletion and never sends a late entry', async () => {
    const h = await harness();
    const pending = deferred();
    h.run.mockImplementation(async (args) => {
      await pending.promise;
      args.signal.throwIfAborted();
      return h.history.get(args.scope);
    });
    const client = port();
    h.owner.registerPort(client.port);
    client.onMessage.emit({ type: 'retry', requestId: 'retry', scope: h.scope });
    await vi.waitFor(() => expect(h.run).toHaveBeenCalledOnce());
    client.onMessage.emit({ type: 'delete', requestId: 'delete', scope: h.scope });
    await flush();
    expect((await h.history.list()).length).toBe(1);
    pending.resolve();
    await vi.waitFor(() =>
      expect(client.postMessage).toHaveBeenCalledWith({
        type: 'deleted',
        requestId: 'delete',
        scope: h.scope,
      })
    );
    expect(await h.history.list()).toEqual([]);
    expect(client.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'entry' }));
  });
  it('disconnect cancels a retry and suppresses its late delivery', async () => {
    const h = await harness();
    const pending = deferred();
    let signal: AbortSignal | undefined;
    h.run.mockImplementation(async (args) => {
      signal = args.signal;
      await pending.promise;
      args.signal.throwIfAborted();
      return h.history.get(args.scope);
    });
    const client = port();
    h.owner.registerPort(client.port);
    client.onMessage.emit({ type: 'retry', requestId: 'retry', scope: h.scope });
    await vi.waitFor(() => expect(h.run).toHaveBeenCalledOnce());
    client.onDisconnect.emit(client.port);
    expect(signal?.aborted).toBe(true);
    pending.resolve();
    await flush();
    expect(client.postMessage).not.toHaveBeenCalled();
  });
});
