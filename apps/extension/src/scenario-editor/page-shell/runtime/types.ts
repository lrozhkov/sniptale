import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

export type ScenarioV3PageSaveState = 'idle' | 'saving' | 'saved' | 'error';

export type ScenarioV3SaveOutcome =
  | { project: ScenarioProjectV3; status: 'saved' }
  | { status: 'superseded' }
  | { status: 'failed' };

export interface ScenarioV3PageProjectState {
  error: string | null;
  loading: boolean;
  project: ScenarioProjectV3 | null;
  retryLoad: () => Promise<void>;
  retrySave: () => Promise<ScenarioV3SaveOutcome | null>;
  saveState: ScenarioV3PageSaveState;
  updateProject: (project: ScenarioProjectV3) => Promise<ScenarioV3SaveOutcome>;
}
