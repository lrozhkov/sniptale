import { describe, expect, it, vi } from 'vitest';
import { createRuntimePortFixture } from '../../../../../tooling/test/support/chrome-runtime-port';
import { createVoiceInputHistoryClient, voiceHistoryScope } from './history-client';
import type { VoiceHistoryEntry } from '@sniptale/runtime-contracts/voice-input';

function entry(revision = 1): VoiceHistoryEntry {
  return {
    entryId: 'entry',
    incarnation: 'incarnation',
    epoch: 'epoch',
    revision,
    audioDigest: `sha256:${'a'.repeat(64)}`,
    sequence: 1,
    createdAt: 1,
    backend: 'browser',
    language: 'ru-RU',
    durationSeconds: 2,
    byteLength: 100,
    mimeType: 'audio/wav',
    rawTranscript: 'raw',
    transcript: 'result',
    status: 'ready',
    correctionStatus: 'off',
    failureCode: null,
  };
}
function fixture() {
  const connection = createRuntimePortFixture();
  let id = 0;
  const client = createVoiceInputHistoryClient({
    connect: () => connection.port,
    createId: () => `request-${++id}`,
  });
  return { client, ...connection };
}

describe('Settings voice history transport', () => {
  it('sends bounded list and exact scope commands without full metadata or binary', async () => {
    const { client, postMessage, onMessage } = fixture();
    const listing = client.list();
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'list', requestId: 'request-1' });
    onMessage.emit({ type: 'list', requestId: 'request-1', entries: [entry()] });
    await expect(listing).resolves.toEqual([entry()]);
    const deleting = client.remove(entry());
    expect(postMessage).toHaveBeenLastCalledWith({
      type: 'delete',
      requestId: 'request-2',
      scope: voiceHistoryScope(entry()),
    });
    expect(Object.keys(postMessage.mock.calls[1]?.[0]?.scope ?? {})).toHaveLength(5);
    onMessage.emit({ type: 'deleted', requestId: 'request-2', scope: voiceHistoryScope(entry()) });
    await expect(deleting).resolves.toBeUndefined();
  });
  it('advances retry scope through progress and accepts only matching current identity and revision', async () => {
    const { client, onMessage } = fixture();
    const progress = vi.fn();
    const finished = vi.fn();
    const retrying = client.retry(entry(), progress).then(finished);
    onMessage.emit({
      type: 'progress',
      requestId: 'request-1',
      phase: 'processing-asr',
      scope: voiceHistoryScope(entry(2)),
    });
    expect(progress).toHaveBeenCalledOnce();
    onMessage.emit({ type: 'entry', requestId: 'request-1', entry: entry() });
    onMessage.emit({
      type: 'entry',
      requestId: 'request-1',
      entry: { ...entry(3), incarnation: 'foreign' },
    });
    await Promise.resolve();
    expect(finished).not.toHaveBeenCalled();
    onMessage.emit({ type: 'entry', requestId: 'request-1', entry: entry(3) });
    await retrying;
    expect(finished).toHaveBeenCalledWith(entry(3));
  });
  it('rejects pending commands on disconnect and reconnects for an explicit refresh', async () => {
    const { client, onDisconnect, port, onMessage } = fixture();
    const pending = client.list();
    const rejected = expect(pending).rejects.toThrow('offscreen-unavailable');
    onDisconnect.emit(port);
    await rejected;
    const recovered = client.list();
    onMessage.emit({ type: 'list', requestId: 'request-2', entries: [] });
    await expect(recovered).resolves.toEqual([]);
  });
  it('rejects all pending commands on disposal and does not accept late results', async () => {
    const { client, onMessage, disconnect } = fixture();
    const pending = client.retry(entry());
    const rejected = expect(pending).rejects.toThrow('offscreen-unavailable');
    client.disconnect();
    await rejected;
    onMessage.emit({ type: 'entry', requestId: 'request-1', entry: entry(2) });
    expect(disconnect).toHaveBeenCalledOnce();
    await expect(client.list()).rejects.toThrow('offscreen-unavailable');
  });
  it('keeps metadata errors fixed and ignores malformed server values', async () => {
    const { client, onMessage } = fixture();
    const pending = client.list();
    onMessage.emit({ type: 'list', requestId: 'request-1', entries: [{ secret: 'invalid' }] });
    const rejected = expect(pending).rejects.toThrow('storage-failed');
    onMessage.emit({ type: 'failure', requestId: 'request-1', code: 'storage-failed' });
    await rejected;
  });
});
