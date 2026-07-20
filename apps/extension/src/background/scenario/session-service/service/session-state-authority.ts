import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import { runPersistedMutation } from '../persisted-mutation';
import type { ScenarioSessionServiceCore } from '../runtime/types/core';
import {
  setScenarioSessionCaptureMode,
  setScenarioSessionEnabled,
  setScenarioSessionRememberProjectSelection,
  setScenarioSessionSidebarVisible,
} from './mutations';

export function createScenarioSessionServiceSessionStateAuthority(
  core: ScenarioSessionServiceCore
) {
  return {
    async setCaptureMode(
      tabId: number,
      captureMode: ScenarioSessionState['captureMode']
    ): Promise<ScenarioSessionState> {
      return runPersistedMutation({
        cloneResult: (session) => ({ ...session }),
        core,
        mutate: () => setScenarioSessionCaptureMode(core.getMutableSession(tabId), captureMode),
      });
    },
    async setEnabled(tabId: number, enabled: boolean): Promise<ScenarioSessionState> {
      return runPersistedMutation({
        cloneResult: (session) => ({ ...session }),
        core,
        mutate: () => setScenarioSessionEnabled(core.getMutableSession(tabId), enabled),
      });
    },
    async setRememberProjectSelection(
      tabId: number,
      rememberProjectSelection: boolean
    ): Promise<ScenarioSessionState> {
      return runPersistedMutation({
        cloneResult: (session) => ({ ...session }),
        core,
        mutate: () =>
          setScenarioSessionRememberProjectSelection(
            core.getMutableSession(tabId),
            rememberProjectSelection
          ),
      });
    },
    async setSidebarVisible(tabId: number, sidebarVisible: boolean): Promise<ScenarioSessionState> {
      return runPersistedMutation({
        cloneResult: (session) => ({ ...session }),
        core,
        mutate: () =>
          setScenarioSessionSidebarVisible(core.getMutableSession(tabId), sidebarVisible),
      });
    },
  };
}
