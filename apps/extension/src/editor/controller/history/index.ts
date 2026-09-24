import { isEditorDocument } from '../../../features/editor/document/guards';
import { type EditorDocument } from '../../../features/editor/document/types';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';

export function createEditorSnapshotHistory(document: EditorDocument): SnapshotHistory<string> {
  return new SnapshotHistory<string>(JSON.stringify(document));
}

export function readCurrentEditorSnapshot(
  history: SnapshotHistory<string> | null
): EditorDocument | null {
  return history ? parseEditorSnapshotDocument(history.getCurrent()) : null;
}

function parseEditorSnapshotDocument(value: string): EditorDocument | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isEditorDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function undoEditorSnapshot(history: SnapshotHistory<string> | null): EditorDocument | null {
  const state = history?.undo();
  if (!state) {
    return null;
  }

  const document = parseEditorSnapshotDocument(state.current);
  if (!document) history?.redo();
  return document;
}

export function redoEditorSnapshot(history: SnapshotHistory<string> | null): EditorDocument | null {
  const state = history?.redo();
  if (!state) {
    return null;
  }

  const document = parseEditorSnapshotDocument(state.current);
  if (!document) history?.undo();
  return document;
}

export function pushEditorSnapshotHistory(options: {
  history: SnapshotHistory<string> | null;
  muted: boolean;
  exportDocument: () => EditorDocument;
}): boolean {
  if (options.muted || !options.history) {
    return false;
  }

  options.history.push(JSON.stringify(options.exportDocument()));
  return true;
}
