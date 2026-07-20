import type {
  ScenarioRecorderSurfaceState,
  ScenarioRestoreSnapshot,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import type {
  PendingScenarioCapture,
  PendingScenarioCaptureInput,
  ResolvedPendingScenarioCapture,
} from '../../types';
import type { ScenarioSessionServiceCore } from './core';

export type { ScenarioSessionServiceCore } from './core';
export type { ScenarioSessionServiceState } from './state';

export type ScenarioSessionServiceRuntime = ScenarioSessionServiceCore & {
  bufferPendingCapture(
    tabId: number,
    capture: PendingScenarioCaptureInput
  ): Promise<ScenarioSessionState>;
  clearPendingCapture(tabId: number): Promise<ScenarioSessionState>;
  clearPendingCaptureIfCurrent(
    tabId: number,
    capture: PendingScenarioCapture
  ): Promise<ScenarioSessionState>;
  consumePendingCapture(tabId: number): Promise<ResolvedPendingScenarioCapture | null>;
  getPendingCapture(tabId: number): PendingScenarioCapture | null;
  getRestoreSnapshot(tabId: number, projectRevision: number): Promise<ScenarioRestoreSnapshot>;
  getSession(tabId: number): Promise<ScenarioSessionState>;
  getSurface(tabId: number): Promise<ScenarioRecorderSurfaceState>;
  hasPendingCapture(tabId: number): boolean;
  resolvePendingCapture(tabId: number): Promise<ResolvedPendingScenarioCapture | null>;
  setActiveProject(
    tabId: number,
    project: { id: string | null; name: string | null },
    options?: { rememberProjectSelection?: boolean }
  ): Promise<ScenarioSessionState>;
  setCaptureMode(
    tabId: number,
    captureMode: ScenarioSessionState['captureMode']
  ): Promise<ScenarioSessionState>;
  setEnabled(tabId: number, enabled: boolean): Promise<ScenarioSessionState>;
  setRememberProjectSelection(
    tabId: number,
    rememberProjectSelection: boolean
  ): Promise<ScenarioSessionState>;
  setSidebarVisible(tabId: number, sidebarVisible: boolean): Promise<ScenarioSessionState>;
  syncProjectRevision(tabId: number, options?: { hasActiveProject?: boolean }): number;
  updateSurfaceState(
    tabId: number,
    surfaceState: ScenarioRecorderSurfaceState
  ): Promise<ScenarioRecorderSurfaceState>;
  bumpProjectRevision(tabId: number): Promise<number>;
};
