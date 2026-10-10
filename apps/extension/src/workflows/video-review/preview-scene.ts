import type { PresentationSequencePlan } from '../../features/video/review/presentation-sequence';
import type {
  QuickEditAdvancedState,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { CanvasCommentExport } from '../../features/video/review/comments';
import type { ReviewClickCue } from '../../features/video/review/click-animation';
import type { ReviewKeyCue } from '../../features/video/review/key-animation';
import type { ReviewTimeSegment } from '../../features/video/review/time-segment';

type Size = { width: number; height: number };

export type PreviewSceneDimensions = { canonical: Size; backing: Size };
export type PreviewScene = {
  captions?:
    | {
        document: QuickEditAdvancedState['text'];
        settings: QuickEditAdvancedState['captions'];
        segments: readonly ReviewTimeSegment[];
      }
    | undefined;
  outerFadePlan?: PresentationSequencePlan | undefined;
  source: Size;
  canvas?: Size;
  background: QuickEditAdvancedState['background'];
  windowHeader?: QuickEditAdvancedState['windowHeader'];
  watermark?: QuickEditAdvancedState['watermark'];
  webcam?: QuickEditAdvancedState['webcam'];
  webcamDuration?: number | undefined;
  zoomRegions: readonly QuickEditZoomRegion[];
  comments: readonly CanvasCommentExport[];
  /** Gallery-only overlays remain visible without altering their burn-in flags. */
  showEditorComments?: boolean;
  keys: readonly ReviewKeyCue[];
  clicks: readonly ReviewClickCue[];
};
