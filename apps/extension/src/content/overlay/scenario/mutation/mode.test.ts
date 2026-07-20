// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const transportMocks = vi.hoisted(() => ({
  setScenarioCaptureModeMock: vi.fn(),
  setScenarioEnabledMock: vi.fn(),
  setScenarioRememberSelectionMock: vi.fn(),
  setScenarioSidebarVisibleMock: vi.fn(),
  updateScenarioSurfaceStateMock: vi.fn(),
}));

const helperMocks = vi.hoisted(() => ({
  restoreNavigationLockStateMock: vi.fn(),
}));

vi.mock('../runtime/transport/session', async (importOriginal) => ({
  ...(await importOriginal()),
  setScenarioCaptureMode: transportMocks.setScenarioCaptureModeMock,
  setScenarioEnabled: transportMocks.setScenarioEnabledMock,
  setScenarioRememberSelection: transportMocks.setScenarioRememberSelectionMock,
  setScenarioSidebarVisible: transportMocks.setScenarioSidebarVisibleMock,
  updateScenarioSurfaceState: transportMocks.updateScenarioSurfaceStateMock,
}));

vi.mock('../../screenshot/bridge', async (importOriginal) => ({
  ...(await importOriginal()),
  restoreNavigationLockState: helperMocks.restoreNavigationLockStateMock,
}));

import {
  applyScenarioCaptureAction,
  applyScenarioCaptureMode,
  applyScenarioEnabledState,
  applyScenarioRememberSelection,
  applyScenarioScreenshotModeDisabled,
  applyScenarioSidebarVisibility,
} from './mode';

function resetModeActionMocks() {
  vi.clearAllMocks();
  transportMocks.updateScenarioSurfaceStateMock.mockResolvedValue({ success: true, surface: {} });
  transportMocks.setScenarioEnabledMock.mockResolvedValue({ success: true, session: {} });
  transportMocks.setScenarioCaptureModeMock.mockResolvedValue({ success: true, session: {} });
  transportMocks.setScenarioRememberSelectionMock.mockResolvedValue({
    success: true,
    session: {},
  });
  transportMocks.setScenarioSidebarVisibleMock.mockResolvedValue({ success: true, session: {} });
}

describe('scenario-controller-mode-actions', () => {
  beforeEach(resetModeActionMocks);

  it(
    'routes capture action updates through surface and enabled state transport',
    expectCaptureActionRouting
  );

  it(
    'handles capture-mode optimism, lock override, and rollback on failure',
    expectCaptureModeOptimismAndRollback
  );

  it(
    'routes session flag updates and disables screenshot mode through sidebar/enabled flows',
    expectSessionFlagUpdatesAndScreenshotDisable
  );
});

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
  const harness = createCaptureModeHarness();

  await applyCaptureModeHarness(harness, 'by-click', true, true);

  expect(helperMocks.restoreNavigationLockStateMock).toHaveBeenCalledWith(
    false,
    harness.setNavigationLockEnabled
  );
  expect(harness.setOptimisticCaptureMode).toHaveBeenCalledWith('by-click');
  expect(harness.applyScenarioResponse).toHaveBeenCalledTimes(1);

  transportMocks.setScenarioCaptureModeMock.mockResolvedValueOnce({
    success: false,
    error: 'fail',
  });

  await applyCaptureModeHarness(harness, 'manual', false, false);

  expect(harness.setOptimisticCaptureMode).toHaveBeenLastCalledWith(null);

  transportMocks.setScenarioCaptureModeMock.mockResolvedValueOnce({
    success: false,
    error: 'fail',
  });

  await applyCaptureModeHarness(harness, 'by-click', true, true);

  expect(helperMocks.restoreNavigationLockStateMock).toHaveBeenLastCalledWith(
    true,
    harness.setNavigationLockEnabled
  );
}

function createCaptureModeHarness() {
  return {
    applyScenarioResponse: vi.fn(),
    setNavigationLockEnabled: vi.fn(),
    setOptimisticCaptureMode: vi.fn(),
  };
}

async function applyCaptureModeHarness(
  harness: ReturnType<typeof createCaptureModeHarness>,
  captureMode: 'manual' | 'by-click',
  navigationLockEnabled: boolean,
  screenshotMode: boolean
) {
  await applyScenarioCaptureMode({
    applyScenarioResponse: harness.applyScenarioResponse,
    captureMode,
    navigationLockEnabled,
    screenshotMode,
    setNavigationLockEnabled: harness.setNavigationLockEnabled,
    setOptimisticCaptureMode: harness.setOptimisticCaptureMode,
  });
}

async function expectSessionFlagUpdatesAndScreenshotDisable() {
  const applyScenarioResponse = vi.fn();

  await applyScenarioEnabledState({ applyScenarioResponse, enabled: false });
  await applyScenarioRememberSelection({
    applyScenarioResponse,
    rememberProjectSelection: false,
  });
  await applyScenarioSidebarVisibility({ applyScenarioResponse, sidebarVisible: false });
  await applyScenarioScreenshotModeDisabled({
    applyScenarioResponse,
    currentSurface: {
      captureAction: 'scenario',
      screenshotMode: true,
      toolbarVisible: true,
    },
  });

  expect(transportMocks.setScenarioEnabledMock).toHaveBeenCalledWith(false);
  expect(transportMocks.setScenarioRememberSelectionMock).toHaveBeenCalledWith(false);
  expect(transportMocks.setScenarioSidebarVisibleMock).toHaveBeenCalledWith(false);
  expect(transportMocks.updateScenarioSurfaceStateMock).toHaveBeenCalledWith({
    captureAction: 'download_default',
    screenshotMode: false,
    toolbarVisible: false,
  });
}
