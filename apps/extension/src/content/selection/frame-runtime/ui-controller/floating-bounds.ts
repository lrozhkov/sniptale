import { queryContentUiElement } from '../../../platform/dom-host';

const FRAME_FLOATING_UI_SELECTORS = [
  '.sniptale-action-toolbar',
  '.sniptale-frame-settings-popover',
  '.sniptale-step-badge-popover',
  '.sniptale-callout-settings-popover',
];

type CombinedFrameFloatingUiRect = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

function mergeRect(
  combinedRect: CombinedFrameFloatingUiRect | null,
  rect: DOMRect
): CombinedFrameFloatingUiRect {
  if (!combinedRect) {
    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
    };
  }

  return {
    bottom: Math.max(combinedRect.bottom, rect.bottom),
    left: Math.min(combinedRect.left, rect.left),
    right: Math.max(combinedRect.right, rect.right),
    top: Math.min(combinedRect.top, rect.top),
  };
}

export function getCombinedFrameFloatingUiRect(): CombinedFrameFloatingUiRect | null {
  return FRAME_FLOATING_UI_SELECTORS.reduce<CombinedFrameFloatingUiRect | null>(
    (combinedRect, selector) => {
      const element = queryContentUiElement(selector);
      if (!(element instanceof HTMLElement)) {
        return combinedRect;
      }

      return mergeRect(combinedRect, element.getBoundingClientRect());
    },
    null
  );
}

export function getDistanceToFrameFloatingUiRect(
  x: number,
  y: number,
  rect: CombinedFrameFloatingUiRect
) {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;

  return Math.sqrt(dx * dx + dy * dy);
}
