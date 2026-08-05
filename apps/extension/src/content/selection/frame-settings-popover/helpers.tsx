import type { CSSProperties } from 'react';
import { colorToRgba, resolveBorderPresetVisual } from '../../../features/highlighter/style';
import { translate } from '../../../platform/i18n';
import type { BlurType, BorderPreset } from '../../../features/highlighter/contracts';

export function getBorderPresetPreviewStyle(preset: BorderPreset): CSSProperties {
  const visual = resolveBorderPresetVisual(preset);

  return {
    width: '16px',
    height: '16px',
    borderWidth: `${Math.min(visual.strokeWidth, 3)}px`,
    borderStyle: visual.strokeStyle,
    borderColor: colorToRgba(visual.strokeColor, visual.strokeOpacity),
    borderRadius: `${Math.min(visual.radius, 4)}px`,
    backgroundColor: colorToRgba(visual.fillColor, visual.fillOpacity),
    opacity: 1,
    boxSizing: 'border-box',
  };
}

export function buildBlurTypeOptions() {
  return [
    {
      value: 'gaussian' as BlurType,
      label: translate('content.overlayControls.blurTypeGaussian'),
      iconName: 'droplet' as const,
    },
    {
      value: 'distortion' as BlurType,
      label: translate('content.overlayControls.blurTypeDistortion'),
      iconName: 'waves' as const,
    },
    {
      value: 'solid' as BlurType,
      label: translate('content.overlayControls.blurTypeSolid'),
      iconName: 'square' as const,
    },
  ];
}
