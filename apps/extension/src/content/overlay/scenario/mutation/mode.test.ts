// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const transportMocks = vi.hoisted(() => ({
  setScenarioCaptureModeMock: vi.fn(),
  setScenarioEnabledMock: vi.fn(),
  setScenarioRememberSelectionMock: vi.fn(),
  setScenarioSidebarVisibleMock: vi.fn(),
  updateScenarioSurfaceStateMock: vi.fn(),
}));

const feedbackMocks = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => feedbackMocks);

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
  applyScenarioRecorderPanelVisibility,
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
    'activates the recorder panel without replacing the ordinary capture action',
    expectCaptureActionRouting
  );

  it(
    'handles capture-mode optimism, lock override, and rollback on failure',
    expectCaptureModeOptimismAndRollback
  );

  it('restores the previous mode and navigation lock when transport rejects', async () => {
    const harness = createCaptureModeHarness();
    transportMocks.setScenarioCaptureModeMock.mockRejectedValueOnce(new Error('Offline'));

    await applyCaptureModeHarness(harness, 'by-click', true, true);

    expect(harness.setOptimisticCaptureMode).toHaveBeenLastCalledWith(null);
    expect(helperMocks.restoreNavigationLockStateMock).toHaveBeenLastCalledWith(
      true,
      harness.setNavigationLockEnabled
    );
    expect(harness.applyScenarioResponse).not.toHaveBeenCalled();
    expect(feedbackMocks.showToast).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'error');
  });

  it(
    'routes session flag updates and disables screenshot mode through sidebar/enabled flows',
    expectSessionFlagUpdatesAndScreenshotDisable
  );
});

function createPanelArgs() {
  return {
    applyScenarioResponse: vi.fn(),
    currentSurface: {
      captureAction: 'copy' as const,
      screenshotMode: false,
      toolbarVisible: false,
    },
    currentSession: {
      enabled: false,
      captureMode: 'manual' as const,
      projectId: 'project-1',
      projectName: 'Project',
      rememberProjectSelection: true,
      pendingProjectSelection: false,
      sidebarVisible: false,
    },
    refreshSession: vi.fn(async () => undefined),
    screenshotMode: true,
    visible: true,
  };
}

async function expectCaptureActionRouting() {
  const args = createPanelArgs();
  await expect(applyScenarioRecorderPanelVisibility(args)).resolves.toBe(true);
  expect(transportMocks.updateScenarioSurfaceStateMock).toHaveBeenCalledWith({
    captureAction: 'copy',
    screenshotMode: true,
    toolbarVisible: true,
  });
  expect(transportMocks.setScenarioEnabledMock).toHaveBeenCalledWith(true);
  expect(transportMocks.setScenarioSidebarVisibleMock).toHaveBeenCalledWith(true);
  expect(args.applyScenarioResponse).toHaveBeenCalledTimes(1);
  expect(transportMocks.updateScenarioSurfaceStateMock.mock.invocationCallOrder[0]).toBeLessThan(
    transportMocks.setScenarioSidebarVisibleMock.mock.invocationCallOrder[0]!
  );
  expect(transportMocks.setScenarioSidebarVisibleMock.mock.invocationCallOrder[0]).toBeLessThan(
    transportMocks.setScenarioEnabledMock.mock.invocationCallOrder[0]!
  );
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
  expect(feedbackMocks.showToast).not.toHaveBeenCalled();

  transportMocks.setScenarioCaptureModeMock.mockResolvedValueOnce({
    success: false,
    error: 'fail',
  });

  await applyCaptureModeHarness(harness, 'manual', false, false);

  expect(harness.setOptimisticCaptureMode).toHaveBeenLastCalledWith(null);
  expect(feedbackMocks.showToast).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'error');

  transportMocks.setScenarioCaptureModeMock.mockResolvedValueOnce({
    success: false,
    error: 'fail',
  });

  await applyCaptureModeHarness(harness, 'by-click', true, true);

  expect(helperMocks.restoreNavigationLockStateMock).toHaveBeenLastCalledWith(
    true,
    harness.setNavigationLockEnabled
  );
  expect(feedbackMocks.showToast).toHaveBeenCalledTimes(2);
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
    captureAction: 'scenario',
    screenshotMode: false,
    toolbarVisible: false,
  });
}

it.each(['enabled', 'sidebar'] as const)(
  'reports refused %s changes without applying a successful state',
  async (kind) => {
    resetModeActionMocks();
    const applyScenarioResponse = vi.fn();
    const transport =
      kind === 'enabled'
        ? transportMocks.setScenarioEnabledMock
        : transportMocks.setScenarioSidebarVisibleMock;
    const apply = () =>
      kind === 'enabled'
        ? applyScenarioEnabledState({ applyScenarioResponse, enabled: true })
        : applyScenarioSidebarVisibility({ applyScenarioResponse, sidebarVisible: true });
    transport.mockResolvedValueOnce({ success: false, error: 'refused' });
    await expect(apply()).resolves.toBe(false);
    expect(applyScenarioResponse).not.toHaveBeenCalled();
    expect(feedbackMocks.showToast).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'error');
    transport.mockRejectedValueOnce(new Error('Offline'));
    await expect(apply()).resolves.toBe(false);
    expect(applyScenarioResponse).not.toHaveBeenCalled();
    expect(feedbackMocks.showToast).toHaveBeenCalledTimes(2);
    await expect(apply()).resolves.toBe(true);
    expect(applyScenarioResponse).toHaveBeenCalledOnce();
  }
);

it('preserves an ordinary capture action when screenshot mode closes', async () => {
  resetModeActionMocks();
  await applyScenarioScreenshotModeDisabled({
    applyScenarioResponse: vi.fn(),
    currentSurface: { captureAction: 'edit', screenshotMode: true, toolbarVisible: true },
  });
  expect(transportMocks.updateScenarioSurfaceStateMock).toHaveBeenCalledWith({
    captureAction: 'edit',
    screenshotMode: false,
    toolbarVisible: false,
  });
});

it('restores the visible toolbar baseline when first-open showing fails before enabling', async () => {
  resetModeActionMocks();
  const args = createPanelArgs();
  transportMocks.setScenarioSidebarVisibleMock.mockResolvedValueOnce({ success: false });
  await expect(applyScenarioRecorderPanelVisibility(args)).resolves.toBe(false);
  expect(transportMocks.setScenarioEnabledMock.mock.calls).toEqual([[false]]);
  expect(transportMocks.setScenarioSidebarVisibleMock.mock.calls).toEqual([[true], [false]]);
  expect(transportMocks.updateScenarioSurfaceStateMock).toHaveBeenLastCalledWith({
    captureAction: 'copy',
    screenshotMode: true,
    toolbarVisible: true,
  });
  expect(args.currentSurface).toEqual({
    captureAction: 'copy',
    screenshotMode: false,
    toolbarVisible: false,
  });
  expect(args.applyScenarioResponse).not.toHaveBeenCalled();
  expect(args.refreshSession).toHaveBeenCalledOnce();
  expect(feedbackMocks.showToast).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'error');
});

it('preserves usable local UI when activation compensation also fails and permits retry', async () => {
  resetModeActionMocks();
  const args = createPanelArgs();
  transportMocks.setScenarioSidebarVisibleMock.mockResolvedValueOnce({ success: false });
  transportMocks.updateScenarioSurfaceStateMock
    .mockResolvedValueOnce({ success: true })
    .mockResolvedValueOnce({ success: false });
  await expect(applyScenarioRecorderPanelVisibility(args)).resolves.toBe(false);
  expect(args.applyScenarioResponse).not.toHaveBeenCalled();
  expect(args.refreshSession).not.toHaveBeenCalled();
  await expect(applyScenarioRecorderPanelVisibility(args)).resolves.toBe(true);
});

it('changes only visibility for an already enabled recorder', async () => {
  resetModeActionMocks();
  const args = createPanelArgs();
  args.currentSession.enabled = true;
  args.visible = false;
  await expect(applyScenarioRecorderPanelVisibility(args)).resolves.toBe(true);
  expect(transportMocks.setScenarioSidebarVisibleMock).toHaveBeenCalledExactlyOnceWith(false);
  expect(transportMocks.setScenarioEnabledMock).not.toHaveBeenCalled();
  expect(transportMocks.updateScenarioSurfaceStateMock).not.toHaveBeenCalled();
});

it.each(['surface', 'enable'] as const)(
  'refuses first-open %s failure without reporting success or changing project identity',
  async (stage) => {
    resetModeActionMocks();
    const args = createPanelArgs();
    const session = { ...args.currentSession };
    if (stage === 'surface')
      transportMocks.updateScenarioSurfaceStateMock.mockResolvedValueOnce({ success: false });
    else transportMocks.setScenarioEnabledMock.mockResolvedValueOnce({ success: false });
    await expect(applyScenarioRecorderPanelVisibility(args)).resolves.toBe(false);
    expect(args.applyScenarioResponse).not.toHaveBeenCalled();
    expect(args.currentSession).toEqual(session);
    expect(transportMocks.setScenarioEnabledMock).toHaveBeenLastCalledWith(false);
    expect(args.refreshSession).toHaveBeenCalledOnce();
    expect(feedbackMocks.showToast).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'error');
  }
);

it('does not enable recording or apply a successful snapshot while showing the panel is pending', async () => {
  resetModeActionMocks();
  const args = createPanelArgs();
  let resolveShow: (value: { success: boolean }) => void = () => undefined;
  let markStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const showing = new Promise<{ success: boolean }>((resolve) => {
    resolveShow = resolve;
  });
  transportMocks.setScenarioSidebarVisibleMock.mockImplementationOnce(() => {
    markStarted();
    return showing;
  });
  const operation = applyScenarioRecorderPanelVisibility(args);
  await started;
  expect(transportMocks.setScenarioEnabledMock).not.toHaveBeenCalled();
  expect(args.applyScenarioResponse).not.toHaveBeenCalled();
  resolveShow({ success: true });
  await expect(operation).resolves.toBe(true);
  expect(transportMocks.setScenarioEnabledMock).toHaveBeenCalledExactlyOnceWith(true);
  expect(args.applyScenarioResponse).toHaveBeenCalledOnce();
});
