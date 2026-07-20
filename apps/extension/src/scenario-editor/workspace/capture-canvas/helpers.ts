import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  SCENARIO_STAGE_HEIGHT,
  SCENARIO_STAGE_WIDTH,
} from '../../../features/scenario/stage/layout';
import type { ScenarioPoint } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioStepPatch } from '../../project/mutation/helpers';
import { clamp } from '../quick-edit/stage.helpers';

export interface ScenarioWorkspacePanDragState {
  origin: ScenarioPoint;
  snapshot: ScenarioCaptureStep;
}

export function createWorkspaceResetPatch(): ScenarioStepPatch {
  return {
    imageTransform: { scale: 1, x: 0, y: 0 },
    viewportTransform: {
      x: 0,
      y: 0,
      width: SCENARIO_STAGE_WIDTH,
      height: SCENARIO_STAGE_HEIGHT,
    },
  };
}

export function resolveWorkspaceStagePoint(
  stageRef: React.RefObject<HTMLDivElement | null>,
  event: Pick<ReactPointerEvent, 'clientX' | 'clientY'>
): ScenarioPoint | null {
  const stage = stageRef.current?.getBoundingClientRect();
  if (!stage) {
    return null;
  }

  return {
    x: clamp(
      ((event.clientX - stage.left) / stage.width) * SCENARIO_STAGE_WIDTH,
      0,
      SCENARIO_STAGE_WIDTH
    ),
    y: clamp(
      ((event.clientY - stage.top) / stage.height) * SCENARIO_STAGE_HEIGHT,
      0,
      SCENARIO_STAGE_HEIGHT
    ),
  };
}

export function applyWorkspaceDragPatch(args: {
  dragState: ScenarioWorkspacePanDragState;
  scale: number;
  event: Pick<PointerEvent, 'clientX' | 'clientY'>;
}): ScenarioStepPatch | null {
  const deltaScale = args.scale > 0 ? 1 / args.scale : 1;
  const deltaX = (args.event.clientX - args.dragState.origin.x) * deltaScale;
  const deltaY = (args.event.clientY - args.dragState.origin.y) * deltaScale;

  return {
    imageTransform: {
      ...args.dragState.snapshot.imageTransform,
      x: args.dragState.snapshot.imageTransform.x + deltaX,
      y: args.dragState.snapshot.imageTransform.y + deltaY,
    },
  };
}
