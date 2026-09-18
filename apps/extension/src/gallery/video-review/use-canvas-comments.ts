import { useRef, useState } from 'react';
import type { CanvasComment } from '../../features/video/review/types';
import { createCanvasComment, updateCanvasComment } from '../../features/video/review/comments';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

/**
 * Owns overlay-comment selection, typed text drafts, and commits; the session
 * serializes the history writes. Drafts survive failed commits so the controlled
 * flush points (Back, export preparation) can retry them without the busy guard.
 */
export function useCanvasComments(args: {
  session: Session;
  time: number;
  busy: boolean;
  exporterPhase: string;
  canStart(): boolean;
  run(action: () => Promise<unknown>): Promise<unknown>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drafts = useRef(new Map<string, string>());
  const guard = () => {
    if (args.busy || args.exporterPhase !== 'idle' || !args.canStart()) return false;
    return true;
  };
  const onDraft = (id: string, text: string) => {
    drafts.current.set(id, text);
  };
  const add = async () => {
    if (!guard()) return;
    const comment = createCanvasComment({ id: crypto.randomUUID(), at: args.time });
    await args.run(() =>
      args.session.commit({
        id: crypto.randomUUID(),
        at: Date.now(),
        target: 'canvasComment',
        before: null,
        after: comment,
      })
    );
    setSelectedId(comment.id);
  };
  const onPatch = async (comment: CanvasComment, change: Partial<Omit<CanvasComment, 'id'>>) => {
    if (!guard()) return;
    const after = updateCanvasComment(comment, change);
    await args.run(() =>
      args.session
        .commit({
          id: crypto.randomUUID(),
          at: Date.now(),
          target: 'canvasComment',
          before: comment,
          after,
        })
        .then(() => drafts.current.delete(comment.id))
    );
  };
  const onDelete = async (comment: CanvasComment) => {
    if (!guard()) return;
    await args.run(() =>
      args.session
        .commit({
          id: crypto.randomUUID(),
          at: Date.now(),
          target: 'canvasComment',
          before: comment,
          after: null,
        })
        .then(() => drafts.current.delete(comment.id))
    );
    setSelectedId((current) => (current === comment.id ? null : current));
  };
  /** Durable flush of unsent text drafts; bypasses the busy gate for lifecycle callers. */
  const flushTexts = async () => {
    let failure: unknown = null;
    for (const [id, text] of [...drafts.current]) {
      const comment = args.session
        .getSnapshot()
        .document.canvasComments.find((item) => item.id === id);
      if (!comment || comment.text === text) {
        drafts.current.delete(id);
        continue;
      }
      try {
        await args.session.commit({
          id: crypto.randomUUID(),
          at: Date.now(),
          target: 'canvasComment',
          before: comment,
          after: updateCanvasComment(comment, { text }),
        });
        drafts.current.delete(id);
      } catch (error) {
        failure = error;
      }
    }
    if (failure) throw failure;
  };
  return {
    selectedId,
    onSelect: setSelectedId,
    onAdd: add,
    onPatch,
    onDelete,
    onDraft,
    flushTexts,
  };
}
