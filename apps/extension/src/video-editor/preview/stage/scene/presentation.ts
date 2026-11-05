import type { VideoCompositionCameraState } from '../../../../features/video/composition/types';
import type { PreviewRendererStatus } from '../../../../features/video/preview/preferences';

/** Camera evaluated for one completed frame; the outer caller owns visible publication. */
export interface PreviewScenePresentation {
  camera: VideoCompositionCameraState;
  time: number;
  renderer?: PreviewRendererStatus;
}
