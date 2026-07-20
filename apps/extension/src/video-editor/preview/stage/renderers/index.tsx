import {
  isAnnotationClip,
  isShapeClip,
  isSubtitleClip,
  isTextClip,
} from '../../../../features/video/project/timeline';
import { getPreviewClipCommonStyle } from '../canvas/clip-layout';
import type { PreviewClipRendererParams } from './types';
import { renderAnnotationPreviewClip } from './annotation';
import { renderMediaPreviewClip } from './media';
import { renderShapePreviewClip, renderTextPreviewClip } from './overlay';

export function renderPreviewClip(params: PreviewClipRendererParams) {
  const commonStyle = getPreviewClipCommonStyle(params.clip, params.currentTime, params.project);
  const mediaPreview = renderMediaPreviewClip({
    assetUrls: params.assetUrls,
    clip: params.clip,
    commonStyle,
    onBeginInteraction: params.onBeginInteraction,
    selectedClipId: params.selectedClipId,
    videoRefs: params.videoRefs,
  });
  if (mediaPreview) {
    return mediaPreview;
  }

  if (isAnnotationClip(params.clip)) {
    return renderAnnotationPreviewClip({
      clip: params.clip,
      currentTime: params.currentTime,
      onBeginInteraction: params.onBeginInteraction,
      project: params.project,
      selectedClipId: params.selectedClipId,
    });
  }

  if (isTextClip(params.clip) || isSubtitleClip(params.clip)) {
    return renderTextPreviewClip({
      clip: params.clip,
      commonStyle,
      onBeginInteraction: params.onBeginInteraction,
      project: params.project,
      selectedClipId: params.selectedClipId,
    });
  }

  if (isShapeClip(params.clip)) {
    return renderShapePreviewClip({
      clip: params.clip,
      commonStyle,
      onBeginInteraction: params.onBeginInteraction,
      selectedClipId: params.selectedClipId,
    });
  }

  return null;
}
