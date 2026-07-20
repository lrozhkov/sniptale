import { getMutableScenarioSession, getMutableScenarioSurface } from '../../state';
import type { ScenarioSessionServiceState } from '../types/state';

export function createScenarioSessionServiceAccessors(state: ScenarioSessionServiceState) {
  return {
    getMutableSession: (tabId: number) => getMutableScenarioSession(state.sessions, tabId),
    getMutableSurface: (tabId: number) => getMutableScenarioSurface(state.surfaces, tabId),
  };
}
