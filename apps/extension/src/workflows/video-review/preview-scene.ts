import type { PresentationSequencePlan } from '../../features/video/review/presentation-sequence';
import type {
  QuickEditAdvancedState,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { CanvasCommentExport } from '../../features/video/review/comments';
import type { ReviewClickCue } from '../../features/video/review/click-animation';
import type { ReviewKeyCue } from '../../features/video/review/key-animation';

type Size = { width: number; height: number };

export type PreviewSceneDimensions = { canonical: Size; backing: Size };
export type PreviewScene = {
  outerFadePlan?: PresentationSequencePlan | undefined;
  source: Size;
  canvas?: Size;
  background: QuickEditAdvancedState['background'];
  windowHeader?: QuickEditAdvancedState['windowHeader'];
  watermark?: QuickEditAdvancedState['watermark'];
  webcam?: QuickEditAdvancedState['webcam'];
  zoomRegions: readonly QuickEditZoomRegion[];
  comments: readonly CanvasCommentExport[];
  keys: readonly ReviewKeyCue[];
  clicks: readonly ReviewClickCue[];
};
