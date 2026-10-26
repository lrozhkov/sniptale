import {
  createDrawingSession,
  type DrawingDocumentV1,
  type DrawingDocumentCommit,
  type DrawingSession,
  type DrawingObjectProjection,
} from '../../features/drawing/public';
/** Drawing supplies reversible effects to the page's existing history owner. */
export interface DrawingHistoryCommitPort {
  registerDrawingRecovery?(
    replay: (document: DrawingDocumentV1) => boolean,
    hasChanges: () => boolean,
    captureDocument: () => DrawingDocumentV1
  ): () => void;
  commitEntry(entry: {
    scope: 'drawing';
    domEffect: {
      recovery?: { before: DrawingDocumentV1; after: DrawingDocumentV1 };
      hasChanges: boolean;
      hasCurrentChanges: () => boolean;
      apply(direction: 'undo' | 'redo'): { failures: string[]; success: boolean };
    };
  }): boolean;
  subscribeToClear(listener: () => void): () => void;
}

const EMPTY_DRAWING_DOCUMENT: DrawingDocumentV1 = { version: 1, objects: [] };

function createDrawingHistoryEffect(
  commit: DrawingDocumentCommit,
  hasCurrentChanges: () => boolean
): Parameters<DrawingHistoryCommitPort['commitEntry']>[0]['domEffect'] {
  return {
    recovery: { before: commit.before, after: commit.after },
    hasChanges: true,
    hasCurrentChanges,
    apply(direction) {
      const applied = commit.replay(direction === 'undo' ? commit.before : commit.after);
      return applied
        ? { failures: [], success: true }
        : { failures: ['drawing-session-unavailable'], success: false };
    },
  };
}

export function createPagePreparationDrawingSession(
  history: DrawingHistoryCommitPort,
  layout?: { projection: DrawingObjectProjection; dispose(): void }
): DrawingSession {
  let session: DrawingSession | null = null;
  let unregisterRecovery = () => {};
  const unsubscribeFromClear = history.subscribeToClear(() => {
    session?.restoreDocument(EMPTY_DRAWING_DOCUMENT);
  });
  session = createDrawingSession({
    ...(layout ? { objectProjection: layout.projection } : {}),
    onDocumentCommit(commit) {
      if (!session) return false;
      return history.commitEntry({
        scope: 'drawing',
        domEffect: createDrawingHistoryEffect(
          commit,
          () => (session?.getSnapshot().document.objects.length ?? 0) > 0
        ),
      });
    },
    onDispose() {
      unregisterRecovery();
      unsubscribeFromClear();
      layout?.dispose();
    },
  });
  unregisterRecovery =
    history.registerDrawingRecovery?.(
      (document) => session?.restoreDocument(document) ?? false,
      () => (session?.getSnapshot().document.objects.length ?? 0) > 0,
      () => session?.getCommittedDocument() ?? EMPTY_DRAWING_DOCUMENT
    ) ?? (() => {});
  return session;
}
