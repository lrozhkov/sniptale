import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import type { PendingScenarioCapture } from '../../types';

export type ScenarioSessionServiceState = {
  hydrationPromise: Promise<void> | null;
  pendingCaptures: Map<number, PendingScenarioCapture>;
  revisions: Map<number, number>;
  sessions: Map<number, ScenarioSessionState>;
  surfaces: Map<number, ScenarioRecorderSurfaceState>;
};
