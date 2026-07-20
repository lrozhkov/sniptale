import type { ScenarioPoint } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import type { RectHandle } from './stage.helpers';

export type ScenarioQuickEditDragState =
  | {
      kind: 'pan';
      origin: ScenarioPoint;
      snapshot: ScenarioCaptureStep;
    }
  | {
      kind: 'move-overlay';
      origin: ScenarioPoint;
      overlayId: string;
      snapshot: ScenarioCaptureStep;
    }
  | {
      kind: 'resize-overlay';
      origin: ScenarioPoint;
      overlayId: string;
      handle: RectHandle;
      snapshot: ScenarioCaptureStep;
    }
  | {
      kind: 'move-arrow-endpoint';
      endpoint: 'start' | 'end';
      origin: ScenarioPoint;
      overlayId: string;
      snapshot: ScenarioCaptureStep;
    };
