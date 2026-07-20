import type { ScenarioPoint } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import { createScenarioOverlayDraft } from './helpers';
import { isRectOverlay, type ScenarioQuickEditTool, updateOverlayPoint } from './stage.helpers';

export function createOverlayAtPoint(
  step: ScenarioCaptureStep,
  tool: Exclude<ScenarioQuickEditTool, 'select' | 'pan'>,
  point: ScenarioPoint
): ScenarioOverlay {
  const nextOverlay = createScenarioOverlayDraft(step, tool);

  if (
    nextOverlay.kind === 'click-ring' ||
    nextOverlay.kind === 'cursor' ||
    nextOverlay.kind === 'text'
  ) {
    return updateOverlayPoint(nextOverlay, point);
  }

  if (nextOverlay.kind === 'arrow') {
    return {
      ...nextOverlay,
      start: point,
      end: point,
    };
  }

  if (isRectOverlay(nextOverlay)) {
    return {
      ...nextOverlay,
      rect: {
        ...nextOverlay.rect,
        x: point.x - nextOverlay.rect.width / 2,
        y: point.y - nextOverlay.rect.height / 2,
      },
    };
  }

  return nextOverlay;
}
