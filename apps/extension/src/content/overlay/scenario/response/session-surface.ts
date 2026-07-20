import type { ScenarioCaptureMode } from '@sniptale/runtime-contracts/scenario/types/base';
import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import type { createDefaultScenarioRestoreSnapshot } from '../session/defaults';
import { shouldRestoreScenarioSurface } from '../session/defaults';
import type { ScenarioControllerResponse } from '../types';

type ScenarioResponseSnapshotOrDataHandlers = {
  applyRestoreSnapshot: (snapshot: ReturnType<typeof createDefaultScenarioRestoreSnapshot>) => void;
  applyScenarioResponseData: (response: ScenarioControllerResponse) => void;
};

export type ScenarioRestoreSnapshotApplierArgs = {
  applySurfaceState: (
    nextSurface: ScenarioRecorderSurfaceState,
    options?: { syncModeState?: boolean }
  ) => void;
  sessionRef: { current: ScenarioSessionState };
  setOptimisticCaptureMode: (captureMode: ScenarioCaptureMode | null) => void;
  setSession: React.Dispatch<React.SetStateAction<ScenarioSessionState>>;
};

export type ScenarioResponseDataApplierArgs = {
  applySurfaceState: (
    nextSurface: ScenarioRecorderSurfaceState,
    options?: { syncModeState?: boolean }
  ) => void;
  setOptimisticCaptureMode: (captureMode: ScenarioCaptureMode | null) => void;
  setSession: React.Dispatch<React.SetStateAction<ScenarioSessionState>>;
};

export function applyScenarioSnapshotOrData(
  response: ScenarioControllerResponse,
  handlers: ScenarioResponseSnapshotOrDataHandlers
) {
  if (response.snapshot) {
    handlers.applyRestoreSnapshot(response.snapshot);
    return;
  }

  handlers.applyScenarioResponseData(response);
}

export function createScenarioRestoreSnapshotApplier(args: ScenarioRestoreSnapshotApplierArgs) {
  return (snapshot: ReturnType<typeof createDefaultScenarioRestoreSnapshot>) => {
    args.setSession(snapshot.session);
    args.sessionRef.current = snapshot.session;
    args.applySurfaceState(snapshot.surface, {
      syncModeState: shouldRestoreScenarioSurface(snapshot),
    });
    args.setOptimisticCaptureMode(null);
  };
}

export function createScenarioResponseDataApplier(args: ScenarioResponseDataApplierArgs) {
  return (response: ScenarioControllerResponse) => {
    if (response.session) {
      args.setSession(response.session);
      args.setOptimisticCaptureMode(null);
    }
    if (response.surface) {
      args.applySurfaceState(response.surface);
    }
  };
}
