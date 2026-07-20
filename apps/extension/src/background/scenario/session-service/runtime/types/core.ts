import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import type { ScenarioSessionPendingCaptureBridge } from '../../pending-capture';
import type { ScenarioSessionPersistedWriteQueue } from '../core/persisted-write';
import type { ScenarioSessionServiceState } from './state';

export type ScenarioSessionServiceCore = ScenarioSessionServiceState & {
  clearTab(tabId: number): Promise<void>;
  ensureHydrated(): Promise<void>;
  getMutableSession(tabId: number): ScenarioSessionState;
  getMutableSurface(tabId: number): ScenarioRecorderSurfaceState;
  pendingCaptureBridge: ScenarioSessionPendingCaptureBridge;
  persistSessions(): Promise<void>;
  runPersistedWrite: ScenarioSessionPersistedWriteQueue;
};
