import type { VideoAnnotationLayoutFamily as VideoAnnotationLayoutFamilyValue } from './layout-family';
import { resolveAnnotationTemplateControls } from './template-controls';
import type { VideoProjectAnnotationClip } from '../types/index';

export { VideoAnnotationLayoutFamily } from './layout-family';

interface VideoAnnotationLayoutFeatures {
  family: VideoAnnotationLayoutFamilyValue;
  showAccentRail: boolean;
  showBadge: boolean;
  showDivider: boolean;
  showSubline: boolean;
  textAlign: 'left' | 'center';
}

export function resolveAnnotationLayoutFeatures(
  templateKind: VideoProjectAnnotationClip['templateKind']
): VideoAnnotationLayoutFeatures {
  const controls = resolveAnnotationTemplateControls(templateKind);

  return {
    family: controls.layoutFamily,
    showAccentRail: controls.showAccentRail,
    showBadge: controls.showBadge,
    showDivider: controls.showDivider,
    showSubline: controls.showSubline,
    textAlign: controls.textAlign,
  };
}
