import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceHistoryEntry, VoiceHistoryScope } from '@sniptale/runtime-contracts/voice-input';
import { createVoiceInputHistory } from '../../../../composition/persistence/voice-input-history';
import {
  createVoiceInputHistoryClient,
  voiceHistoryScope,
  type VoiceInputHistoryClient,
} from '../../../../workflows/voice-input/history-client';

export interface VoiceHistoryDependencies {
  createClient(): VoiceInputHistoryClient;
  readAudio: ReturnType<typeof createVoiceInputHistory>['readAudio'];
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  copy(text: string): Promise<void>;
}

function defaultDependencies(): VoiceHistoryDependencies {
  const history = createVoiceInputHistory();
  return {
    createClient: createVoiceInputHistoryClient,
    readAudio: (scope, signal) => history.readAudio(scope, signal),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    copy: (text) => navigator.clipboard.writeText(text),
  };
}

function useVoicePlayback(deps: VoiceHistoryDependencies, setError: (error: boolean) => void) {
  const [playback, setPlayback] = useState<{ entryId: string; url: string } | null>(null);
  const owner = useRef({
    mounted: false,
    audio: null as AbortController | null,
    url: null as string | null,
  });
  const stop = useCallback(() => {
    owner.current.audio?.abort();
    owner.current.audio = null;
    if (owner.current.url) deps.revokeObjectURL(owner.current.url);
    owner.current.url = null;
    if (owner.current.mounted) setPlayback(null);
  }, [deps]);
  useEffect(() => {
    const state = owner.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
      stop();
    };
  }, [stop]);
  async function play(entry: VoiceHistoryEntry): Promise<void> {
    stop();
    const controller = new AbortController();
    owner.current.audio = controller;
    setError(false);
    try {
      const file = await deps.readAudio(voiceHistoryScope(entry), controller.signal);
      if (controller.signal.aborted || !owner.current.mounted) return;
      const url = deps.createObjectURL(file);
      owner.current.url = url;
      setPlayback({ entryId: entry.entryId, url });
    } catch {
      if (!controller.signal.aborted && owner.current.mounted) setError(true);
    }
  }
  return { playback, play, stop };
}

function mergeHistoryList(current: VoiceHistoryEntry[], incoming: VoiceHistoryEntry[]) {
  return incoming.map((entry) => {
    const previous = current.find(
      (item) => item.entryId === entry.entryId && item.incarnation === entry.incarnation
    );
    return previous && previous.revision > entry.revision ? previous : entry;
  });
}

function updateHistoryEntry(
  items: VoiceHistoryEntry[],
  scope: VoiceHistoryScope,
  update: (entry: VoiceHistoryEntry) => VoiceHistoryEntry
) {
  return items.map((item) =>
    item.entryId === scope.entryId &&
    item.incarnation === scope.incarnation &&
    item.revision <= scope.revision
      ? update(item)
      : item
  );
}

/** Each mounted panel owns its Port and pending metadata operations. */
export function useVoiceHistory(dependencies?: VoiceHistoryDependencies) {
  const [deps] = useState(() => dependencies ?? defaultDependencies());
  const [entries, setEntries] = useState<VoiceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const playback = useVoicePlayback(deps, setError);
  const owner = useRef({
    client: null as VoiceInputHistoryClient | null,
    mounted: false,
    version: 0,
    busy: new Set<string>(),
    deleting: new Set<string>(),
    cancelledRetries: new Set<string>(),
  });

  async function refresh(): Promise<void> {
    const state = owner.current;
    const version = ++state.version;
    setLoading(true);
    setError(false);
    try {
      const result = await state.client?.list();
      if (!state.mounted || version !== state.version || !result) return;
      setEntries((items) => mergeHistoryList(items, result));
    } catch {
      if (state.mounted && version === state.version) setError(true);
    } finally {
      if (state.mounted && version === state.version) setLoading(false);
    }
  }
  useEffect(() => {
    const state = owner.current;
    state.mounted = true;
    state.client = deps.createClient();
    void refresh();
    return () => {
      state.mounted = false;
      state.version += 1;
      state.client?.disconnect();
      state.client = null;
    };
  }, [deps]);

  function publishBusy(): void {
    if (!owner.current.mounted) return;
    setBusyIds(new Set(owner.current.busy));
    setDeletingIds(new Set(owner.current.deleting));
  }
  function invalidateList(): void {
    owner.current.version += 1;
    if (owner.current.mounted) setLoading(false);
  }
  async function reconcileFailure(): Promise<void> {
    if (!owner.current.mounted) return;
    await refresh();
    if (owner.current.mounted) setError(true);
  }
  async function retry(entry: VoiceHistoryEntry): Promise<void> {
    const state = owner.current;
    if (!state.client || state.deleting.has(entry.entryId) || state.busy.has(entry.entryId)) return;
    const identity = `${entry.epoch}/${entry.incarnation}`;
    state.busy.add(entry.entryId);
    publishBusy();
    invalidateList();
    setError(false);
    try {
      const updated = await state.client.retry(voiceHistoryScope(entry), (event) => {
        if (!state.mounted) return;
        invalidateList();
        setEntries((items) =>
          updateHistoryEntry(items, event.scope, (item) => ({
            ...item,
            ...event.scope,
            status: 'processing',
          }))
        );
      });
      if (!state.mounted) return;
      invalidateList();
      setEntries((items) => updateHistoryEntry(items, updated, () => updated));
    } catch {
      if (state.deleting.has(entry.entryId) || state.cancelledRetries.has(identity)) return;
      await reconcileFailure();
    } finally {
      state.cancelledRetries.delete(identity);
      state.busy.delete(entry.entryId);
      publishBusy();
    }
  }
  async function remove(entry: VoiceHistoryEntry): Promise<void> {
    const state = owner.current;
    if (!state.client || state.deleting.has(entry.entryId)) return;
    if (state.busy.has(entry.entryId))
      state.cancelledRetries.add(`${entry.epoch}/${entry.incarnation}`);
    state.deleting.add(entry.entryId);
    publishBusy();
    invalidateList();
    setError(false);
    playback.stop();
    try {
      await state.client.remove(voiceHistoryScope(entry));
      if (!state.mounted) return;
      invalidateList();
      setEntries((items) => items.filter((item) => item.entryId !== entry.entryId));
    } catch {
      await reconcileFailure();
    } finally {
      state.deleting.delete(entry.entryId);
      publishBusy();
    }
  }
  async function copy(entry: VoiceHistoryEntry): Promise<void> {
    try {
      await deps.copy(entry.transcript ?? entry.rawTranscript ?? '');
      if (owner.current.mounted) setCopiedId(entry.entryId);
    } catch {
      if (owner.current.mounted) setError(true);
    }
  }
  return {
    entries,
    loading,
    error,
    busyIds,
    deletingIds,
    copiedId,
    refresh,
    retry,
    remove,
    copy,
    ...playback,
  };
}
