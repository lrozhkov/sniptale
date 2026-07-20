import type { EditorDocument } from '../../../features/editor/document/types';
import type { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { pushEditorSnapshotHistory } from '../history';

export function withEditorHistoryMuted<T>(options: {
  getHistoryMuted: () => number;
  setHistoryMuted: (nextValue: number) => void;
  callback: () => T;
}): T {
  const { getHistoryMuted, setHistoryMuted, callback } = options;
  setHistoryMuted(getHistoryMuted() + 1);
  try {
    return callback();
  } finally {
    setHistoryMuted(getHistoryMuted() - 1);
  }
}

export function commitEditorHistory(options: {
  history: SnapshotHistory<string> | null;
  historyMuted: boolean;
  exportDocument: () => EditorDocument;
  syncRuntimeState: () => void;
}): boolean {
  const committed = pushEditorSnapshotHistory({
    history: options.history,
    muted: options.historyMuted,
    exportDocument: options.exportDocument,
  });
  if (!committed) {
    return false;
  }

  options.syncRuntimeState();
  return true;
}
