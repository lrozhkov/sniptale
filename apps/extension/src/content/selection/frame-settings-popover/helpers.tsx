import type { CSSProperties } from 'react';
import { colorToRgba, resolveBorderPresetVisual } from '../../../features/highlighter/style';
import { translate } from '../../../platform/i18n';
import type { BlurType, BorderPreset } from '../../../features/highlighter/contracts';

const POPOVER_WIDTH = 280;
const POPOVER_HEIGHT = 360;
const POPOVER_MARGIN = 8;

export function getFrameSettingsPopoverStyle(anchorEl: HTMLElement | null): CSSProperties {
  if (!anchorEl) {
    return {
      position: 'fixed',
      top: 0,
      left: 0,
      visibility: 'hidden',
      pointerEvents: 'none',
    };
  }

  const rect = anchorEl.getBoundingClientRect();

  let top = rect.bottom + POPOVER_MARGIN;
  let left = rect.left;

  if (top + POPOVER_HEIGHT > window.innerHeight) {
    top = rect.top - POPOVER_HEIGHT - POPOVER_MARGIN;
  }

  if (left + POPOVER_WIDTH > window.innerWidth) {
    left = window.innerWidth - POPOVER_WIDTH - POPOVER_MARGIN;
  }

  return {
    position: 'fixed',
    top: Math.max(POPOVER_MARGIN, top),
    left: Math.max(POPOVER_MARGIN, left),
    zIndex: 2147483647,
    pointerEvents: 'auto',
  };
}

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
