import { useState } from 'react';
import type { CanvasComment } from '../../features/video/review/types';
import { createCanvasComment, updateCanvasComment } from '../../features/video/review/comments';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

/** Owns overlay-comment selection and commits; the session serializes the history writes. */
export function useCanvasComments(args: {
  session: Session;
  time: number;
  busy: boolean;
  exporterPhase: string;
  canStart(): boolean;
  run(action: () => Promise<unknown>): Promise<unknown>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const guard = () => {
    if (args.busy || args.exporterPhase !== 'idle' || !args.canStart()) return false;
    return true;
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
      args.session.commit({
        id: crypto.randomUUID(),
        at: Date.now(),
        target: 'canvasComment',
        before: comment,
        after,
      })
    );
  };
  const onDelete = async (comment: CanvasComment) => {
    if (!guard()) return;
    await args.run(() =>
      args.session.commit({
        id: crypto.randomUUID(),
        at: Date.now(),
        target: 'canvasComment',
        before: comment,
        after: null,
      })
    );
    setSelectedId((current) => (current === comment.id ? null : current));
  };
  return { selectedId, onSelect: setSelectedId, onAdd: add, onPatch, onDelete };
}
