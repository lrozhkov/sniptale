import {
  createDrawingSession,
  type DrawingDocumentV1,
  type DrawingDocumentCommit,
  type DrawingSession,
  type DrawingObjectProjection,
} from '../../features/drawing/public';
/** Drawing supplies reversible effects to the page's existing history owner. */
export interface DrawingHistoryCommitPort {
  commitEntry(entry: {
    scope: 'drawing';
    domEffect: {
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
  let replayLatestDocument: DrawingDocumentCommit['replay'] | null = null;
  const unsubscribeFromClear = history.subscribeToClear(() => {
    replayLatestDocument?.(EMPTY_DRAWING_DOCUMENT);
  });
  session = createDrawingSession({
    ...(layout ? { objectProjection: layout.projection } : {}),
    onDocumentCommit(commit) {
      if (!session) return false;
      const previousReplay = replayLatestDocument;
      replayLatestDocument = commit.replay;
      const accepted = history.commitEntry({
        scope: 'drawing',
        domEffect: createDrawingHistoryEffect(
          commit,
          () => (session?.getSnapshot().document.objects.length ?? 0) > 0
        ),
      });
      if (!accepted) replayLatestDocument = previousReplay;
      return accepted;
    },
    onDispose() {
      unsubscribeFromClear();
      layout?.dispose();
    },
  });
  return session;
}
