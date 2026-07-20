import type {
  ScenarioCaptureSourceKind,
  ScenarioCaptureSurface,
} from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { PendingScenarioCapture } from '../../storage/scenario/session/contracts';
export type {
  PendingScenarioCapture,
  ScenarioStoredTabState,
} from '../../storage/scenario/session/contracts';

export interface PendingScenarioCaptureInput {
  id: string;
  dataUrl: string;
  filename: string;
  galleryAssetId: string | null;
  captureSurface: ScenarioCaptureSurface;
  sourceKind: ScenarioCaptureSourceKind;
  page: ScenarioPageDescriptor;
  target: ScenarioTargetDescriptor | null;
  interactionPoint: ScenarioPoint | null;
  cursorPoint: ScenarioPoint | null;
  captureMetadata?: ScenarioCaptureMetadata;
  title: string;
  body: string;
}

export interface ResolvedPendingScenarioCapture extends PendingScenarioCapture {
  dataUrl: string;
}
