// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const transportMocks = vi.hoisted(() => ({
  createScenarioProjectMock: vi.fn(),
  deleteScenarioStepMock: vi.fn(),
  moveScenarioStepMock: vi.fn(),
  restoreScenarioStepMock: vi.fn(),
  setScenarioActiveProjectMock: vi.fn(),
  setScenarioCaptureModeMock: vi.fn(),
  setScenarioEnabledMock: vi.fn(),
  setScenarioRememberSelectionMock: vi.fn(),
  setScenarioSidebarVisibleMock: vi.fn(),
  updateScenarioSurfaceStateMock: vi.fn(),
}));

const helperMocks = vi.hoisted(() => ({
  restoreNavigationLockStateMock: vi.fn(),
  showToastMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: helperMocks.translateMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  showToast: helperMocks.showToastMock,
}));

vi.mock('../runtime/transport/session', async (importOriginal) => ({
  ...(await importOriginal()),
  setScenarioCaptureMode: transportMocks.setScenarioCaptureModeMock,
  setScenarioEnabled: transportMocks.setScenarioEnabledMock,
  setScenarioRememberSelection: transportMocks.setScenarioRememberSelectionMock,
  setScenarioSidebarVisible: transportMocks.setScenarioSidebarVisibleMock,
  updateScenarioSurfaceState: transportMocks.updateScenarioSurfaceStateMock,
}));

vi.mock('../runtime/transport/projects', async (importOriginal) => ({
  ...(await importOriginal()),
  createScenarioProject: transportMocks.createScenarioProjectMock,
  setScenarioActiveProject: transportMocks.setScenarioActiveProjectMock,
}));

vi.mock('../runtime/transport/steps', async (importOriginal) => ({
  ...(await importOriginal()),
  deleteScenarioStep: transportMocks.deleteScenarioStepMock,
  moveScenarioStep: transportMocks.moveScenarioStepMock,
  restoreScenarioStep: transportMocks.restoreScenarioStepMock,
}));

vi.mock('../../screenshot/bridge', async (importOriginal) => ({
  ...(await importOriginal()),
  restoreNavigationLockState: helperMocks.restoreNavigationLockStateMock,
}));

import {
  applyScenarioCaptureAction,
  applyScenarioCaptureMode,
  applyScenarioDeleteRecentStep,
  applyScenarioEnabledState,
  applyScenarioProjectCreation,
  applyScenarioProjectSelection,
  applyScenarioRememberSelection,
  applyScenarioRestoreRecentStep,
  applyScenarioScreenshotModeDisabled,
  applyScenarioSidebarVisibility,
  applyScenarioMoveRecentStep,
} from './index';
import { createScenarioSession } from '../session/test-support';

function resetScenarioActionMocks() {
  vi.clearAllMocks();
  transportMocks.updateScenarioSurfaceStateMock.mockResolvedValue({ success: true, surface: {} });
  transportMocks.setScenarioEnabledMock.mockResolvedValue({ success: true, session: {} });
  transportMocks.setScenarioCaptureModeMock.mockResolvedValue({ success: true, session: {} });
  transportMocks.setScenarioRememberSelectionMock.mockResolvedValue({
    success: true,
    session: {},
  });
  transportMocks.setScenarioSidebarVisibleMock.mockResolvedValue({ success: true, session: {} });
  transportMocks.setScenarioActiveProjectMock.mockResolvedValue({ success: true, session: {} });
  transportMocks.createScenarioProjectMock.mockResolvedValue({
    success: true,
    projectId: 'project-2',
    session: { projectId: 'project-2' },
  });
  transportMocks.deleteScenarioStepMock.mockResolvedValue({ success: true });
  transportMocks.moveScenarioStepMock.mockResolvedValue({ success: true });
  transportMocks.restoreScenarioStepMock.mockResolvedValue({ success: true });
}

async function expectCaptureActionRouting() {
  const applyScenarioResponse = vi.fn();

  await applyScenarioCaptureAction({
    actionType: 'scenario',
    applyScenarioResponse,
    currentSurface: {
      captureAction: 'download_default',
      screenshotMode: false,
      toolbarVisible: false,
    },
  });

  expect(transportMocks.updateScenarioSurfaceStateMock).toHaveBeenCalledWith({
    captureAction: 'scenario',
    screenshotMode: true,
    toolbarVisible: true,
  });
  expect(transportMocks.setScenarioEnabledMock).toHaveBeenCalledWith(true);
  expect(applyScenarioResponse).toHaveBeenCalledTimes(2);
}

async function expectCaptureModeOptimismAndRollback() {
  const applyScenarioResponse = vi.fn();
  const setNavigationLockEnabled = vi.fn();
  const setOptimisticCaptureMode = vi.fn();

  await applyScenarioCaptureMode({
    applyScenarioResponse,
    captureMode: 'by-click',
    navigationLockEnabled: true,
    screenshotMode: true,
    setNavigationLockEnabled,
    setOptimisticCaptureMode,
  });

  expect(helperMocks.restoreNavigationLockStateMock).toHaveBeenCalledWith(
    false,
    setNavigationLockEnabled
  );
  expect(setOptimisticCaptureMode).toHaveBeenCalledWith('by-click');
  expect(applyScenarioResponse).toHaveBeenCalledTimes(1);

  transportMocks.setScenarioCaptureModeMock.mockResolvedValueOnce({
    success: false,
    error: 'fail',
  });

  await applyScenarioCaptureMode({
    applyScenarioResponse,
    captureMode: 'manual',
    navigationLockEnabled: false,
    screenshotMode: false,
    setNavigationLockEnabled,
    setOptimisticCaptureMode,
  });

  expect(setOptimisticCaptureMode).toHaveBeenLastCalledWith(null);
}

async function expectStateToggleAndStepMutationRouting() {
  const applyScenarioResponse = vi.fn();
  await applyScenarioEnabledState({ applyScenarioResponse, enabled: false });
  await applyScenarioRememberSelection({
    applyScenarioResponse,
    rememberProjectSelection: false,
  });
  await applyScenarioSidebarVisibility({ applyScenarioResponse, sidebarVisible: false });
  await applyScenarioProjectSelection({
    applyScenarioResponse,
    currentSession: createScenarioSession({ rememberProjectSelection: false }),
    projectId: 'project-9',
  });
  await applyScenarioDeleteRecentStep({
    applyScenarioResponse,
    projectId: 'project-9',
    stepId: 'step-1',
  });
  await applyScenarioMoveRecentStep({
    applyScenarioResponse,
    projectId: 'project-9',
    stepId: 'step-1',
    toIndex: 4,
  });
  await applyScenarioRestoreRecentStep({
    applyScenarioResponse,
    projectId: 'project-9',
    stepId: 'step-1',
  });
  expect(transportMocks.setScenarioEnabledMock).toHaveBeenCalledWith(false);
  expect(transportMocks.setScenarioRememberSelectionMock).toHaveBeenCalledWith(false);
  expect(transportMocks.setScenarioSidebarVisibleMock).toHaveBeenCalledWith(false);
  expect(transportMocks.setScenarioActiveProjectMock).toHaveBeenCalledWith({
    projectId: 'project-9',
    rememberProjectSelection: false,
  });
  expect(transportMocks.deleteScenarioStepMock).toHaveBeenCalledWith({
    projectId: 'project-9',
    stepId: 'step-1',
  });
  expect(transportMocks.moveScenarioStepMock).toHaveBeenCalledWith({
    projectId: 'project-9',
    stepId: 'step-1',
    toIndex: 4,
  });
  expect(transportMocks.restoreScenarioStepMock).toHaveBeenCalledWith({
    projectId: 'project-9',
    stepId: 'step-1',
  });
}

async function expectScreenshotModeDisableFlow() {
  const applyScenarioResponse = vi.fn();

  await applyScenarioScreenshotModeDisabled({
    applyScenarioResponse,
    currentSurface: {
      captureAction: 'scenario',
      screenshotMode: true,
      toolbarVisible: true,
    },
  });

  expect(transportMocks.updateScenarioSurfaceStateMock).toHaveBeenCalledWith({
    captureAction: 'download_default',
    screenshotMode: false,
    toolbarVisible: false,
  });
  expect(transportMocks.setScenarioSidebarVisibleMock).toHaveBeenCalledWith(false);
  expect(transportMocks.setScenarioEnabledMock).toHaveBeenLastCalledWith(false);
}

async function expectProjectCreationSuccessAndFailure() {
  const applyScenarioResponse = vi.fn();
  const refreshSession = vi.fn(async () => undefined);

  await applyScenarioProjectCreation({
    applyScenarioResponse,
    currentSession: createScenarioSession(),
    name: '  ',
    refreshSession,
  });

  expect(transportMocks.createScenarioProjectMock).toHaveBeenCalledWith({
    name: '  ',
    rememberProjectSelection: true,
  });
  expect(applyScenarioResponse).toHaveBeenCalledWith(
    expect.objectContaining({
      session: expect.objectContaining({
        projectId: 'project-2',
        projectName: 'scenario.common.defaultProjectName',
      }),
    })
  );
  expect(refreshSession).toHaveBeenCalledTimes(1);

  transportMocks.createScenarioProjectMock.mockResolvedValueOnce({
    success: false,
    error: 'Create failed',
  });

  await expect(
    applyScenarioProjectCreation({
      applyScenarioResponse,
      currentSession: createScenarioSession(),
      name: 'New project',
      refreshSession,
    })
  ).rejects.toThrow('Create failed');

  expect(helperMocks.showToastMock).toHaveBeenCalledWith('Create failed', 'error');
}

describe('useScenarioController.actions', () => {
  beforeEach(resetScenarioActionMocks);

  it('routes capture action updates through the transport owner and applies both responses', async () => {
    await expectCaptureActionRouting();
  });

  it('handles capture-mode optimism, restore lock, and failed rollback', async () => {
    await expectCaptureModeOptimismAndRollback();
  });

  it('routes state toggles and recent-step mutations through the transport owner', async () => {
    await expectStateToggleAndStepMutationRouting();
  });

  it('disables screenshot mode by narrowing surface state and hiding sidebar', async () => {
    await expectScreenshotModeDisableFlow();
  });

  it('creates projects through transport and surfaces create errors', async () => {
    await expectProjectCreationSuccessAndFailure();
  });
});
