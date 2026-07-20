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
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';

export interface PendingScenarioCapture {
  id: string;
  pendingAssetId: string;
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

export interface ScenarioStoredTabState {
  session: ScenarioSessionState;
  surface: ScenarioRecorderSurfaceState;
  pendingCapture: PendingScenarioCapture | null;
}
