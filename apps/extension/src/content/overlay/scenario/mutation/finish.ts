import type {
  ScenarioRecorderSurfaceState,
  ScenarioSessionState,
} from '@sniptale/runtime-contracts/scenario/types/session';
import { openScenarioEditor } from '../runtime/transport/projects';
import {
  setScenarioEnabled,
  setScenarioSidebarVisible,
  updateScenarioSurfaceState,
} from '../runtime/transport/session';
import type { ScenarioControllerResponse } from '../types';

async function requireScenarioResponse(request: Promise<ScenarioControllerResponse>) {
  const response = await request;
  if (!response.success) throw new Error('Scenario finish operation failed');
  return response;
}

export async function finishScenarioRecording(args: {
  applyScenarioResponse: (response: ScenarioControllerResponse) => void;
  currentSession: ScenarioSessionState;
  currentSurface: ScenarioRecorderSurfaceState;
  refreshSession: () => Promise<void>;
}) {
  await requireScenarioResponse(setScenarioEnabled(false));
  try {
    const surfaceResponse = await requireScenarioResponse(
      updateScenarioSurfaceState({
        ...args.currentSurface,
        captureAction: 'download_default',
        screenshotMode: false,
        toolbarVisible: false,
      })
    );
    const sessionResponse = await requireScenarioResponse(setScenarioSidebarVisible(false));
    await openScenarioEditor({ projectId: args.currentSession.projectId });
    args.applyScenarioResponse(surfaceResponse);
    args.applyScenarioResponse(sessionResponse);
  } catch (error) {
    // Restore recording last, after its surface and sidebar have been restored.
    try {
      await requireScenarioResponse(updateScenarioSurfaceState(args.currentSurface));
      await requireScenarioResponse(setScenarioSidebarVisible(args.currentSession.sidebarVisible));
      await requireScenarioResponse(setScenarioEnabled(args.currentSession.enabled));
    } finally {
      await args.refreshSession();
    }
    throw error;
  }
}
