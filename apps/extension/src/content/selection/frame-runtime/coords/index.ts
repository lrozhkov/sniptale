import type { BorderPadding } from '../../../../features/highlighter/contracts';

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
  const { borderWidth, padding } = settings;

  return {
    x: elementPos.x - padding.left - borderWidth,
    y: elementPos.y - padding.top - borderWidth,
    width: elementPos.width + padding.left + padding.right,
    height: elementPos.height + padding.top + padding.bottom,
  };
}

export function createFrameCalcSettings(
  borderSettings?: { width?: number; padding?: BorderPadding } | null
): FrameCalcSettings {
  return {
    borderWidth: borderSettings?.width ?? DEFAULT_BORDER_WIDTH,
    padding: borderSettings?.padding ?? DEFAULT_PADDING,
  };
}
