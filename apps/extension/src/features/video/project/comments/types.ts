import type { CanvasComment, ReviewAnnotation } from '../../review/types';

/** The document clock is independent from each overlay's spatial attachment. */
export type VideoProjectCommentBinding =
  | { kind: 'project' }
  | { kind: 'source'; assetId: string; sourceInstanceId: string };

/** Notes and passive legacy metadata survive cuts without storing projected timeline rows. */
export interface VideoProjectCommentDocument {
  id: string;
  binding: VideoProjectCommentBinding;
  annotations: ReviewAnnotation[];
  /** Legacy payload for retention and conversion. Native notes do not author or render it. */
  canvasComments: CanvasComment[];
}
