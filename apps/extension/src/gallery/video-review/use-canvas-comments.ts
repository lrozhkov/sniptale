import { useCallback, useRef, useState } from 'react';
import type { CanvasComment, ReviewAnnotation } from '../../features/video/review/types';
import {
  createCanvasComment,
  showOnVideoWindow,
  switchCanvasCommentAttachment,
  updateCanvasComment,
} from '../../features/video/review/comments';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

/** Geometry the stage observes; attachment switching maps points through it. */
interface ReviewCommentGeometry {
  output: { width: number; height: number };
  videoTransform: { x: number; y: number; width: number; height: number } | null;
}

/**
 * Holds the stage geometry observed by the stage binding and maps attachment
 * switches through it; a point without a content coordinate denies the switch.
 */
function useOverlayGeometry(
  onPatch: (comment: CanvasComment, change: Partial<Omit<CanvasComment, 'id'>>) => Promise<void>,
  allowed: () => boolean
) {
  const geometry = useRef<ReviewCommentGeometry | null>(null);
  const setGeometry = useCallback((value: ReviewCommentGeometry) => {
    geometry.current = value;
  }, []);
  const onSwitchAttachment = async (
    comment: CanvasComment,
    attachment: CanvasComment['attachment']
  ): Promise<boolean> => {
    if (!allowed() || comment.attachment === attachment) return false;
    const mapped = switchCanvasCommentAttachment(
      comment,
      attachment,
      geometry.current ?? { output: { width: 1, height: 1 }, videoTransform: null }
    );
    if (!mapped) return false;
    await onPatch(comment, { attachment, position: mapped.position });
    return true;
  };
  return { setGeometry, onSwitchAttachment };
}

/** Deterministic offset so consecutive default-position comments do not fully stack. */
function staggeredCommentPosition(count: number): { x: number; y: number } {
  const x = 0.5 + ((count % 3) - 1) * 0.06;
  const y = 0.5 + (Math.floor(count / 3) % 3) * 0.08;
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

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
  selectedId?: string | null;
  onSelectionChange?(id: string | null): void;
}) {
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const selectedId = args.selectedId === undefined ? localSelectedId : args.selectedId;
  const setSelectedId = (id: string | null) => {
    if (args.selectedId === undefined) setLocalSelectedId(id);
    args.onSelectionChange?.(id);
  };
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
    const comment = createCanvasComment({
      id: crypto.randomUUID(),
      at: args.time,
      position: staggeredCommentPosition(args.session.getSnapshot().document.canvasComments.length),
    });
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
  /**
   * Shows an existing annotation on the video: one linked overlay whose text the
   * annotation owns, no retyping. The overlay window covers the annotation anchor.
   */
  const showOnVideo = async (annotation: ReviewAnnotation) => {
    if (!guard()) return;
    const comment = createCanvasComment({
      id: crypto.randomUUID(),
      annotationId: annotation.id,
      ...showOnVideoWindow(annotation.anchor),
      position: staggeredCommentPosition(args.session.getSnapshot().document.canvasComments.length),
    });
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
  /**
   * Attachment switch re-expresses the current visual point in the other space;
   * a viewport point on the background has no content coordinate, so the switch
   * is denied instead of silently clamping.
   */
  const { setGeometry, onSwitchAttachment } = useOverlayGeometry(onPatch, guard);
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
    if (selectedId === comment.id) setSelectedId(null);
  };
  /** Durable flush of unsent text drafts; bypasses the busy gate for lifecycle callers. */
  const flushTexts = async () => {
    let failure: unknown = null;
    for (const [id, text] of [...drafts.current]) {
      const comment = args.session
        .getSnapshot()
        .document.canvasComments.find((item) => item.id === id);
      if (!comment || comment.text === text || comment.annotationId) {
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
    onSwitchAttachment,
    onShowOnVideo: showOnVideo,
    onDelete,
    onDraft,
    flushTexts,
    setGeometry,
  };
}
