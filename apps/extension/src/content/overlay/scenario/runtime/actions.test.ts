import { describe, expect, it, vi } from 'vitest';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';

const actionMocks = vi.hoisted(() => ({
  applyScenarioRecorderPanelVisibility: vi.fn(),
  applyScenarioCaptureMode: vi.fn(),
  applyScenarioDeleteRecentStep: vi.fn(),
  applyScenarioEnabledState: vi.fn(),
  applyScenarioMoveRecentStep: vi.fn(),
  applyScenarioProjectCreation: vi.fn(),
  applyScenarioProjectSelection: vi.fn(),
  applyScenarioRememberSelection: vi.fn(),
  applyScenarioRestoreRecentStep: vi.fn(),
  applyScenarioScreenshotModeDisabled: vi.fn(),
  applyScenarioSidebarVisibility: vi.fn(),
  openScenarioEditor: vi.fn(),
}));

vi.mock('../mutation/mode', () => ({
  applyScenarioRecorderPanelVisibility: actionMocks.applyScenarioRecorderPanelVisibility,
  applyScenarioCaptureMode: actionMocks.applyScenarioCaptureMode,
  applyScenarioEnabledState: actionMocks.applyScenarioEnabledState,
  applyScenarioRememberSelection: actionMocks.applyScenarioRememberSelection,
  applyScenarioScreenshotModeDisabled: actionMocks.applyScenarioScreenshotModeDisabled,
  applyScenarioSidebarVisibility: actionMocks.applyScenarioSidebarVisibility,
}));

vi.mock('../mutation/project', () => ({
  applyScenarioProjectCreation: actionMocks.applyScenarioProjectCreation,
  applyScenarioProjectSelection: actionMocks.applyScenarioProjectSelection,
}));

vi.mock('../mutation/step', () => ({
  applyScenarioDeleteRecentStep: actionMocks.applyScenarioDeleteRecentStep,
  applyScenarioMoveRecentStep: actionMocks.applyScenarioMoveRecentStep,
  applyScenarioRestoreRecentStep: actionMocks.applyScenarioRestoreRecentStep,
}));

vi.mock('./transport/projects', () => ({
  createScenarioProject: vi.fn(),
  openScenarioEditor: actionMocks.openScenarioEditor,
  setScenarioActiveProject: vi.fn(),
}));

import { createScenarioControllerActions, type ScenarioPanelPendingOperation } from './actions';

function createSession(overrides: Partial<ScenarioSessionState> = {}): ScenarioSessionState {
  return {
    enabled: true,
    captureMode: 'manual',
    pendingProjectSelection: false,
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    sidebarVisible: true,
    ...overrides,
  };
}

function createActions(
  session = createSession(),
  panelPendingRef: { current: ScenarioPanelPendingOperation | null } = { current: null }
) {
  return createScenarioControllerActions({
    finishPendingRef: { current: null },
    panelPendingRef,
    applyScenarioResponse: vi.fn(),
    currentSurfaceRef: {
      current: {
        captureAction: 'download_default',
        screenshotMode: true,
        toolbarVisible: true,
      },
    },
    navigationLockEnabled: true,
    refreshSession: vi.fn(async () => undefined),
    screenshotMode: true,
    sessionRef: { current: session },
    setNavigationLockEnabled: vi.fn(),
    setOptimisticCaptureMode: vi.fn(),
  });
}

describe('scenario-controller-runtime-actions', () => {
  it('opens the editor with the current project id', async () => {
    const actions = createActions();

    await actions.openEditor('step-1');

    expect(actionMocks.openScenarioEditor).toHaveBeenCalledWith({
      projectId: 'project-1',
      stepId: 'step-1',
    });
  });

  it('skips recent-step mutations when the session has no project id', async () => {
    const actions = createActions(createSession({ projectId: null }));

    await actions.deleteRecentStep('step-1');
    await actions.moveRecentStep('step-1', 2);
    expect(actionMocks.applyScenarioDeleteRecentStep).not.toHaveBeenCalled();
    expect(actionMocks.applyScenarioMoveRecentStep).not.toHaveBeenCalled();
    expect(actionMocks.applyScenarioRestoreRecentStep).not.toHaveBeenCalled();
  });
});

it('keeps panel activation single flight across rerenders and rejects an opposing operation', async () => {
  actionMocks.applyScenarioRecorderPanelVisibility.mockReset();
  const panelPendingRef: { current: ScenarioPanelPendingOperation | null } = { current: null };
  const session = createSession({ enabled: false });
  let resolve: (value: boolean) => void = () => undefined;
  actionMocks.applyScenarioRecorderPanelVisibility.mockReturnValueOnce(
    new Promise<boolean>((complete) => {
      resolve = complete;
    })
  );
  const first = createActions(session, panelPendingRef).setRecorderPanelVisible(true);
  const second = createActions(session, panelPendingRef).setRecorderPanelVisible(true);
  expect(second).toBe(first);
  await expect(
    createActions(session, panelPendingRef).setRecorderPanelVisible(false)
  ).resolves.toBe(false);
  expect(actionMocks.applyScenarioRecorderPanelVisibility).toHaveBeenCalledOnce();
  expect(actionMocks.applyScenarioRecorderPanelVisibility).toHaveBeenCalledWith(
    expect.objectContaining({
      currentSurface: {
        captureAction: 'download_default',
        screenshotMode: true,
        toolbarVisible: true,
      },
      screenshotMode: true,
      visible: true,
    })
  );
  resolve(false);
  await expect(first).resolves.toBe(false);
  expect(panelPendingRef.current).toBeNull();
  actionMocks.applyScenarioRecorderPanelVisibility.mockResolvedValueOnce(true);
  await expect(createActions(session, panelPendingRef).setRecorderPanelVisible(true)).resolves.toBe(
    true
  );
  expect(actionMocks.applyScenarioRecorderPanelVisibility).toHaveBeenCalledTimes(2);
});
