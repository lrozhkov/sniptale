import type { ScenarioOverlay, ScenarioOverlayAutoSource } from '../contracts/types/overlays';
import type {
  ScenarioFramePadding,
  ScenarioPoint,
  ScenarioRect,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';

const ZERO_FRAME_PADDING: ScenarioFramePadding = {
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

function getFramePadding(
  framePadding: ScenarioFramePadding | null | undefined
): ScenarioFramePadding {
  return framePadding ?? ZERO_FRAME_PADDING;
}

function expandRectByPadding(
  rect: ScenarioRect,
  framePadding: ScenarioFramePadding | null | undefined
): ScenarioRect {
  const padding = getFramePadding(framePadding);
  return {
    x: rect.x - padding.left,
    y: rect.y - padding.top,
    width: rect.width + padding.left + padding.right,
    height: rect.height + padding.top + padding.bottom,
  };
}

export function buildFocusRectOverlay(
  target: ScenarioTargetDescriptor,
  options?: { autoSource?: ScenarioOverlayAutoSource }
): ScenarioOverlay[] {
  return target.rect
    ? [
        {
          id: crypto.randomUUID(),
          kind: 'focus-rect',
          rect: expandRectByPadding(target.rect, target.framePadding),
          ...(options?.autoSource ? { autoSource: options.autoSource } : {}),
        },
      ]
    : [];
}

export function buildClickRingOverlay(
  point: ScenarioPoint | null | undefined,
  options?: { autoSource?: ScenarioOverlayAutoSource }
): ScenarioOverlay[] {
  return point
    ? [
        {
          id: crypto.randomUUID(),
          kind: 'click-ring',
          point,
          ...(options?.autoSource ? { autoSource: options.autoSource } : {}),
        },
      ]
    : [];
}
