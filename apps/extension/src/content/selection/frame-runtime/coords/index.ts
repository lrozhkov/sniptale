import type { BorderPadding } from '../../../../features/highlighter/contracts';
import { projectElementFrameSurface } from '../../../../features/highlighter/frame-surface';

const DEFAULT_BORDER_WIDTH = 3;
const DEFAULT_PADDING: BorderPadding = {
  top: 3,
  left: 3,
  right: 3,
  bottom: 3,
};

interface FrameCalcSettings {
  borderWidth: number;
  padding: BorderPadding;
}

interface FrameContainerCoords {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementAbsolutePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculateFrameContainerCoords(
  elementPos: ElementAbsolutePosition,
  settings: FrameCalcSettings
): FrameContainerCoords {
  return projectElementFrameSurface(elementPos, {
    strokeWidth: settings.borderWidth,
    padding: settings.padding,
  });
}

export function createFrameCalcSettings(
  borderSettings?: { width?: number; padding?: BorderPadding } | null
): FrameCalcSettings {
  return {
    borderWidth: borderSettings?.width ?? DEFAULT_BORDER_WIDTH,
    padding: borderSettings?.padding ?? DEFAULT_PADDING,
  };
}
