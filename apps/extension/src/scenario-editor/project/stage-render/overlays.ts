import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import type {
  ScenarioPoint,
  ScenarioRect,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import { DEFAULT_BLUR_SETTINGS } from '../../../features/highlighter/style/defaults';

function createOverlayId() {
  return crypto.randomUUID();
}

export function createScenarioFocusOverlay(rect: ScenarioRect): ScenarioOverlay {
  return {
    id: createOverlayId(),
    kind: 'focus-rect',
    rect,
  };
}

export function createScenarioClickOverlay(point: ScenarioPoint): ScenarioOverlay {
  return {
    id: createOverlayId(),
    kind: 'click-ring',
    point,
  };
}

export function createScenarioCursorOverlay(point: ScenarioPoint): ScenarioOverlay {
  return {
    id: createOverlayId(),
    kind: 'cursor',
    point,
  };
}

export function createScenarioBlurOverlay(rect: ScenarioRect): ScenarioOverlay {
  return {
    id: createOverlayId(),
    kind: 'blur-rect',
    rect,
    blurSettings: { ...DEFAULT_BLUR_SETTINGS },
  };
}
