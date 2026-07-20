import { usePreviewStageCanvasRender } from './render';
import { usePreviewStageCanvasResizeVersion } from './resize';
import type { PreviewStageCanvasSceneParams } from './types';
import { usePreviewStageVideoFrameVersion } from './video-frame';

export function usePreviewStageCanvasScene(params: PreviewStageCanvasSceneParams): void {
  const resizeVersion = usePreviewStageCanvasResizeVersion(params.stageRef);
  const videoFrameState = usePreviewStageVideoFrameVersion(
    params.activeClips,
    params.currentTime,
    params.videoRefs
  );

  usePreviewStageCanvasRender({
    ...params,
    resizeVersion,
    videoFrameState,
  });
}
