// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceHistoryEntry } from '@sniptale/runtime-contracts/voice-input';
import { useVoiceHistory, type VoiceHistoryDependencies } from './use-voice-history';

function entry(id = 'one', revision = 1): VoiceHistoryEntry {
  return {
    entryId: id,
    incarnation: id,
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
    transcript: 'accepted',
    status: 'processing',
    correctionStatus: 'off',
    failureCode: null,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
let container: HTMLDivElement;
let root: Root;
let result: ReturnType<typeof useVoiceHistory>;
function loadedEntry(index = 0): VoiceHistoryEntry {
  const value = result.entries[index];
  if (!value) throw new Error(`Expected history entry at index ${index}`);
  return value;
}
function fixture() {
  const client = {
    list: vi.fn().mockResolvedValue([entry(), entry('two')]),
    retry: vi.fn().mockResolvedValue({ ...entry('one', 3), status: 'ready' }),
    remove: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  };
  const deps: VoiceHistoryDependencies = {
    createClient: () => client,
    readAudio: vi.fn().mockResolvedValue(new File(['audio'], 'voice.wav')),
    createObjectURL: vi
      .fn()
      .mockReturnValueOnce('blob:one')
      .mockReturnValueOnce('blob:two')
      .mockReturnValue('blob:three'),
    revokeObjectURL: vi.fn(),
    copy: vi.fn().mockResolvedValue(undefined),
  };
  function Harness() {
    result = useVoiceHistory(deps);
    return null;
  }
  return {
    client,
    deps,
    async mount() {
      await act(async () => root.render(createElement(Harness)));
    },
  };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe('voice history lifecycle', () => {
  it('allows recovery retry of persisted processing and guards only actual live commands', async () => {
    const f = fixture();
    const retry = deferred<VoiceHistoryEntry>();
    f.client.retry.mockReturnValue(retry.promise);
    await f.mount();
    let pending!: Promise<void>;
    act(() => {
      pending = result.retry(loadedEntry());
    });
    expect(result.busyIds.has('one')).toBe(true);
    await act(async () => result.retry(loadedEntry()));
    expect(f.client.retry).toHaveBeenCalledOnce();
    await act(async () => {
      retry.resolve({ ...entry('one', 3), status: 'ready' });
      await pending;
    });
    expect(loadedEntry().revision).toBe(3);
    expect(result.busyIds.size).toBe(0);
  });
  it('preserves valid metadata after failure and refresh recovers after a worker restart', async () => {
    const f = fixture();
    await f.mount();
    f.client.retry.mockRejectedValueOnce(new Error('storage-failed'));
    await act(async () => result.retry(loadedEntry()));
    expect(result.error).toBe(true);
    expect(result.entries).toHaveLength(2);
    await act(async () => result.refresh());
    expect(result.error).toBe(false);
  });
  it('updates revisions on progress before final completion and ignores a stale list', async () => {
    const f = fixture();
    await f.mount();
    const retry = deferred<VoiceHistoryEntry>();
    const listing = deferred<VoiceHistoryEntry[]>();
    f.client.retry.mockReturnValue(retry.promise);
    let operation!: Promise<void>;
    act(() => {
      operation = result.retry(loadedEntry());
    });
    f.client.list.mockReturnValue(listing.promise);
    let refresh!: Promise<void>;
    act(() => {
      refresh = result.refresh();
    });
    await act(async () => {
      retry.resolve({ ...entry('one', 4), status: 'ready' });
      await operation;
    });
    await act(async () => {
      listing.resolve([entry()]);
      await refresh;
    });
    expect(loadedEntry().revision).toBe(4);
    expect(result.loading).toBe(false);
  });
  it('revokes playback URLs on switch, deletion and unmount', async () => {
    const f = fixture();
    await f.mount();
    await act(async () => result.play(loadedEntry()));
    expect(result.playback?.url).toBe('blob:one');
    await act(async () => result.play(loadedEntry(1)));
    expect(f.deps.revokeObjectURL).toHaveBeenCalledWith('blob:one');
    await act(async () => result.remove(loadedEntry(1)));
    expect(f.deps.revokeObjectURL).toHaveBeenCalledWith('blob:two');
    expect(result.entries.map((item) => item.entryId)).toEqual(['one']);
    await act(async () => result.play(loadedEntry()));
    act(() => root.unmount());
    root = createRoot(container);
    expect(f.deps.revokeObjectURL).toHaveBeenCalledTimes(3);
    expect(f.client.disconnect).toHaveBeenCalledOnce();
  });
  it('does not install late audio after switch, deletion or unmount', async () => {
    const f = fixture();
    const first = deferred<File>();
    const second = deferred<File>();
    vi.mocked(f.deps.readAudio)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    await f.mount();
    let loading!: Promise<void>;
    act(() => {
      loading = result.play(loadedEntry());
    });
    let switched!: Promise<void>;
    act(() => {
      switched = result.play(loadedEntry(1));
    });
    await act(async () => {
      first.resolve(new File(['old'], 'old.wav'));
      await loading;
    });
    expect(f.deps.createObjectURL).not.toHaveBeenCalled();
    await act(async () => result.remove(loadedEntry(1)));
    await act(async () => {
      second.resolve(new File(['old'], 'old.wav'));
      await switched;
    });
    expect(f.deps.createObjectURL).not.toHaveBeenCalled();
  });
  it('permits deletion during retry and ignores late progress and final delivery', async () => {
    const f = fixture();
    await f.mount();
    const retry = deferred<VoiceHistoryEntry>();
    let emit:
      | ((event: {
          type: 'progress';
          requestId: string;
          phase: 'processing-asr';
          scope: VoiceHistoryEntry;
        }) => void)
      | undefined;
    f.client.retry.mockImplementation((_scope, listener) => {
      emit = listener;
      return retry.promise;
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.retry(loadedEntry());
    });
    expect(result.busyIds.has('one')).toBe(true);
    await act(async () => result.remove(loadedEntry()));
    expect(f.client.remove).toHaveBeenCalledOnce();
    expect(result.entries.map((item) => item.entryId)).toEqual(['two']);
    act(() =>
      emit?.({
        type: 'progress',
        requestId: 'retry',
        phase: 'processing-asr',
        scope: entry('one', 3),
      })
    );
    await act(async () => {
      retry.resolve(entry('one', 4));
      await pending;
    });
    expect(result.entries.map((item) => item.entryId)).toEqual(['two']);
    expect(result.deletingIds.size).toBe(0);
  });

  it.each(['before deletion', 'after deletion'] as const)(
    'suppresses the retry cancellation failure %s without refreshing deleted metadata',
    async (ordering) => {
      const f = fixture();
      await f.mount();
      const retry = deferred<VoiceHistoryEntry>();
      const deletion = deferred<void>();
      f.client.retry.mockReturnValue(retry.promise);
      f.client.remove.mockReturnValue(deletion.promise);
      let retrying!: Promise<void>;
      let deleting!: Promise<void>;
      act(() => {
        retrying = result.retry(loadedEntry());
      });
      act(() => {
        deleting = result.remove(loadedEntry());
      });
      if (ordering === 'before deletion') {
        await act(async () => {
          retry.reject(new Error('cancelled'));
          await retrying;
        });
        expect(result.error).toBe(false);
      }
      await act(async () => {
        deletion.resolve();
        await deleting;
      });
      if (ordering === 'after deletion') {
        await act(async () => {
          retry.reject(new Error('cancelled'));
          await retrying;
        });
      }
      expect(result.entries.map((item) => item.entryId)).toEqual(['two']);
      expect(result.error).toBe(false);
      expect(f.client.list).toHaveBeenCalledOnce();
      expect(result.busyIds.size).toBe(0);
      expect(result.deletingIds.size).toBe(0);
    }
  );

  it('copies accepted text with raw fallback without altering history', async () => {
    const f = fixture();
    await f.mount();
    await act(async () => result.copy(loadedEntry()));
    expect(f.deps.copy).toHaveBeenLastCalledWith('accepted');
    await act(async () => result.copy({ ...loadedEntry(), transcript: null }));
    expect(f.deps.copy).toHaveBeenLastCalledWith('raw');
    expect(result.entries).toHaveLength(2);
  });
});
