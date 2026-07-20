import type {
  ScenarioElement,
  ScenarioProjectV3,
  ScenarioSlide,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioV3PageSaveState } from './runtime/types';

export interface ScenarioV3EditorSaveStatus {
  error: string | null;
  retrySave: () => Promise<void>;
  state: ScenarioV3PageSaveState;
}

export interface ScenarioV3EditorShellProps {
  initialSlideId?: string | null;
  onProjectChange?: (project: ScenarioProjectV3) => void;
  project: ScenarioProjectV3;
  saveStatus?: ScenarioV3EditorSaveStatus | undefined;
  saveProject?: (project: ScenarioProjectV3) => Promise<ScenarioProjectV3>;
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
