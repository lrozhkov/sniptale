import { expect, it, vi } from 'vitest';
import { projectPreparationScenario, type PreparationSurfaceControllers } from './layout-props';

function createScenarioController(): PreparationSurfaceControllers['scenarioController'] {
  return {
    applyCaptureAction: vi.fn(),
    buildManualCapturePayload: vi.fn(),
    captureAction: 'scenario',
    createProject: vi.fn(),
    deleteRecentStep: vi.fn(),
    ensureCaptureReady: vi.fn(),
    handleScreenshotModeDisabled: vi.fn(),
    moveRecentStep: vi.fn(),
    openEditor: vi.fn(),
    pendingProjectSelection: false,
    projects: [
      {
        id: 'project-1',
        name: 'Project 1',
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    recentStepHighlightToken: 3,
    recentSteps: [],
    rememberProjectSelection: true,
    refreshSession: vi.fn(),
    restoreRecentStep: vi.fn(),
    saveSelectionCapture: vi.fn(),
    scenarioCaptureMode: 'manual',
    scenarioEnabled: true,
    scenarioProjectId: 'project-1',
    scenarioProjectName: 'Project 1',
    selectProject: vi.fn(),
    setCaptureMode: vi.fn(),
    setEnabled: vi.fn(),
    setRememberProjectSelection: vi.fn(),
    setSidebarVisible: vi.fn(),
    sidebarVisible: true,
    trashedSteps: [],
  };
}

it('projects real scenario layout props for the viewer sidebar gate', () => {
  const controller = createScenarioController();
  const scenario = projectPreparationScenario(controller);

  expect(scenario.state).toEqual(
    expect.objectContaining({
      captureAction: 'scenario',
      scenarioEnabled: true,
      scenarioProjectId: 'project-1',
      sidebarVisible: true,
    })
  );
  expect(scenario.actions.applyCaptureAction).toBe(controller.applyCaptureAction);
  expect(scenario.actions.setSidebarVisible).toBe(controller.setSidebarVisible);
});
