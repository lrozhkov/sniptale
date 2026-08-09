import {
  createDrawingSession,
  type DrawingDocumentV1,
  type DrawingDocumentCommit,
  type DrawingSession,
} from '../../features/drawing/public';
import { pagePreparationHistory } from '../parser/page-preparation/history';
import type { PagePreparationHistoryDomEffect } from '../parser/page-preparation/history/types';

type DrawingHistoryCommitPort = Pick<
  typeof pagePreparationHistory,
  'commitEntry' | 'subscribeToClear'
>;

const EMPTY_DRAWING_DOCUMENT: DrawingDocumentV1 = { version: 1, objects: [] };

function createDrawingHistoryEffect(
  commit: DrawingDocumentCommit
): PagePreparationHistoryDomEffect {
  return {
    hasChanges: true,
    apply(direction) {
      const applied = commit.replay(direction === 'undo' ? commit.before : commit.after);
      return applied
        ? { failures: [], success: true }
        : { failures: ['drawing-session-unavailable'], success: false };
    },
  };
}

export function createPagePreparationDrawingSession(
  history: DrawingHistoryCommitPort = pagePreparationHistory
): DrawingSession {
  let session: DrawingSession | null = null;
  let replayLatestDocument: DrawingDocumentCommit['replay'] | null = null;
  const unsubscribeFromClear = history.subscribeToClear(() => {
    replayLatestDocument?.(EMPTY_DRAWING_DOCUMENT);
  });
  session = createDrawingSession({
    onDocumentCommit(commit) {
      if (!session) return false;
      const previousReplay = replayLatestDocument;
      replayLatestDocument = commit.replay;
      const accepted = history.commitEntry({ domEffect: createDrawingHistoryEffect(commit) });
      if (!accepted) replayLatestDocument = previousReplay;
      return accepted;
    },
    onDispose: unsubscribeFromClear,
  });
  return session;
}
