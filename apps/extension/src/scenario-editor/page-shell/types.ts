import type {
  ScenarioElement,
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioV3PageSaveState, ScenarioV3SaveOutcome } from './runtime/types';
import type { ScenarioAggregateChildMutation } from '../../composition/persistence/scenario/aggregate-mutations';

export type CommitScenarioV3AggregateMutation = (
  mutateSession: (session: ScenarioV3EditorSession) => ScenarioV3EditorSession,
  children: ScenarioAggregateChildMutation
) => Promise<void>;

export interface ScenarioV3EditorSaveStatus {
  error: string | null;
  retrySave: () => Promise<ScenarioV3SaveOutcome | null>;
  state: ScenarioV3PageSaveState;
}

export interface ScenarioV3EditorShellProps {
  initialSlideId?: string | null;
  onProjectChange?: (project: ScenarioProjectV3) => void;
  project: ScenarioProjectV3;
  saveStatus?: ScenarioV3EditorSaveStatus | undefined;
}

export interface ScenarioV3EditorSession {
  history: ScenarioV3ProjectHistory;
  project: ScenarioProjectV3;
  selectedElementId: string | null;
  selectedSlideId: string | null;
}

export interface ScenarioV3ProjectHistory {
  future: ScenarioProjectV3[];
  past: ScenarioProjectV3[];
}

export interface ScenarioV3EditorSelection {
  selectedElement: ScenarioElement | null;
  selectedSlide: ScenarioSlide;
}
