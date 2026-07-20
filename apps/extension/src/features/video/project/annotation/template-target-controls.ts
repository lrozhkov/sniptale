import { VideoOverlayTemplateKind, type VideoProjectAnnotationClip } from '../types/index';

const TARGET_AWARE_TEMPLATE_KINDS = new Set<VideoProjectAnnotationClip['templateKind']>([
  VideoOverlayTemplateKind.CALLOUT_CARD,
  VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
  VideoOverlayTemplateKind.CALLOUT_NOTIFICATION_BANNER,
  VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD,
  VideoOverlayTemplateKind.FOCUS_SCAN_FRAME,
  VideoOverlayTemplateKind.POINTER_LABEL,
]);

export interface VideoAnnotationTargetControls {
  supportsArrowKind: boolean;
  supportsLeaderLineStyle: boolean;
  supportsLeaderLineThickness: boolean;
  supportsMarkerKind: boolean;
  supportsTarget: boolean;
}

export function resolveAnnotationTargetControls(
  templateKind: VideoProjectAnnotationClip['templateKind']
): VideoAnnotationTargetControls {
  const supportsTarget = TARGET_AWARE_TEMPLATE_KINDS.has(templateKind);

  return {
    supportsArrowKind: supportsTarget,
    supportsLeaderLineStyle: supportsTarget,
    supportsLeaderLineThickness: supportsTarget,
    supportsMarkerKind: supportsTarget,
    supportsTarget,
  };
}
