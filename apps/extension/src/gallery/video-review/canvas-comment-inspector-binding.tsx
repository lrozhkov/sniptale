import type { ReviewAnnotation, ReviewDocument } from '../../features/video/review/types';
import { ReviewCanvasCommentsSection } from './comment-editor';
import type { useCanvasComments } from './use-canvas-comments';

type CanvasComments = ReturnType<typeof useCanvasComments>;

/** Overlay list visibility and commands change independently from the note inspector. */
export function ReviewCanvasCommentListBinding(props: {
  state: {
    advanced: { ui: { mode: 'basic' | 'advanced' } };
    snapshot: { document: Pick<ReviewDocument, 'canvasComments' | 'annotations'> };
    busy: boolean;
    editing: { exporter: { phase: string } };
  };
  canvasComments: CanvasComments;
  duration: number;
}) {
  if (props.state.advanced.ui.mode !== 'advanced') return null;
  return (
    <ReviewCanvasCommentsSection
      view="list"
      {...props.canvasComments}
      comments={props.state.snapshot.document.canvasComments}
      annotations={props.state.snapshot.document.annotations}
      duration={props.duration}
      busy={props.state.busy || props.state.editing.exporter.phase !== 'idle'}
    />
  );
}

/** The saved-note bridge enters the same canvas-comment selection owner as direct creation. */
export function showReviewAnnotationOnVideo(
  state: {
    video: { readonly current: HTMLVideoElement | null };
    setMode(mode: 'basic' | 'advanced'): void;
  },
  canvasComments: CanvasComments,
  annotation: ReviewAnnotation
) {
  state.video.current?.pause();
  state.setMode('advanced');
  void canvasComments.onShowOnVideo(annotation);
}
