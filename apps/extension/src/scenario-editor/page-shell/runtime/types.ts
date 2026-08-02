import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';

export type ScenarioV3PageSaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface ScenarioV3PageProjectState {
  error: string | null;
  loading: boolean;
  project: ScenarioProjectV3 | null;
  retryLoad: () => Promise<void>;
  retrySave: () => Promise<void>;
  saveState: ScenarioV3PageSaveState;
  updateProject: (project: ScenarioProjectV3) => void;
}
