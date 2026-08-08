import type { CSSProperties } from 'react';

import { resolveBorderPresetVisual } from '../../../features/highlighter/style';
import { translate } from '../../../platform/i18n';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import { AVAILABLE_HIGHLIGHTER_BLUR_TYPES } from '../../../features/highlighter/blur-types';

export function getBorderPresetPreviewStyle(preset: BorderPreset): CSSProperties {
  const visual = resolveBorderPresetVisual(preset);

  return {
    width: '16px',
    height: '16px',
    borderWidth: `${Math.min(visual.strokeWidth, 3)}px`,
    borderStyle: visual.strokeStyle,
    borderColor: visual.strokeColor,
    borderRadius: `${Math.min(visual.radius, 4)}px`,
    background: visual.fillCss,
    opacity: 1,
    boxSizing: 'border-box',
  };
}

export function buildBlurTypeOptions() {
  const metadata = {
    gaussian: {
      label: translate('content.overlayControls.blurTypeGaussian'),
      iconName: 'droplet' as const,
    },
    distortion: {
      label: translate('content.overlayControls.blurTypeDistortion'),
      iconName: 'waves' as const,
    },
    solid: {
      label: translate('content.overlayControls.blurTypeSolid'),
      iconName: 'square' as const,
    },
  } satisfies Record<
    (typeof AVAILABLE_HIGHLIGHTER_BLUR_TYPES)[number],
    { iconName: 'droplet' | 'square' | 'waves'; label: string }
  >;

  return AVAILABLE_HIGHLIGHTER_BLUR_TYPES.map((value) => ({
    value,
    ...metadata[value],
  }));
}
