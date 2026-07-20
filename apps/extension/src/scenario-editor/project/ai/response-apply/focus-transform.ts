import {
  createDefaultScenarioViewportTransform,
  resolveScenarioStageLayout,
} from '../../../../features/scenario/stage/layout';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioCaptureStep } from '../../../../features/scenario/contracts/types/project';
import type { ScenarioPoint } from '@sniptale/runtime-contracts/scenario/types/geometry';
import { MAX_SCENARIO_AI_ZOOM, MIN_SCENARIO_AI_ZOOM } from './constants';
import { clamp } from './guards';

export function isFinitePoint(value: ScenarioPoint | undefined): value is ScenarioPoint {
  return Boolean(
    value &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}

export function clampFocusPoint(step: ScenarioCaptureStep, point: ScenarioPoint): ScenarioPoint {
  const width = Math.max(step.page.viewport.width, 1);
  const height = Math.max(step.page.viewport.height, 1);

  return {
    x: clamp(point.x, 0, width),
    y: clamp(point.y, 0, height),
  };
}

export function createImageTransformForFocusPoint(args: {
  asset: Pick<ScenarioAssetEntry, 'height' | 'width'>;
  focusPoint: ScenarioPoint;
  scale: number;
  step: ScenarioCaptureStep;
}) {
  const normalizedScale = clamp(args.scale, MIN_SCENARIO_AI_ZOOM, MAX_SCENARIO_AI_ZOOM);
  const layout = resolveScenarioStageLayout(
    {
      ...args.step,
      imageTransform: {
        ...args.step.imageTransform,
        scale: normalizedScale,
        x: 0,
        y: 0,
      },
      viewportTransform: args.step.viewportTransform ?? createDefaultScenarioViewportTransform(),
    },
    args.asset
  );
  const projectedFocusX =
    args.focusPoint.x * (layout.imageRect.width / Math.max(layout.sourceViewport.width, 1));
  const projectedFocusY =
    args.focusPoint.y * (layout.imageRect.height / Math.max(layout.sourceViewport.height, 1));

  return {
    scale: normalizedScale,
    x: Number((layout.imageRect.width / 2 - projectedFocusX).toFixed(2)),
    y: Number((layout.imageRect.height / 2 - projectedFocusY).toFixed(2)),
  };
}
