// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  buildScenarioControllerViewState: vi.fn(),
  useScenarioAutoClickCapture: vi.fn(),
  useScenarioControllerRuntime: vi.fn(),
  useScenarioControllerState: vi.fn(),
  useScenarioNavigationLockOverride: vi.fn(),
  useScenarioSessionRefresh: vi.fn(),
  useScenarioSuggestedEventLogging: vi.fn(),
}));

vi.mock('./auto-click-capture', () => ({
  useScenarioAutoClickCapture: controllerMocks.useScenarioAutoClickCapture,
}));

vi.mock('./navigation-lock-override', () => ({
  useScenarioNavigationLockOverride: controllerMocks.useScenarioNavigationLockOverride,
}));

vi.mock('./suggested-event-logging', () => ({
  useScenarioSuggestedEventLogging: controllerMocks.useScenarioSuggestedEventLogging,
}));

vi.mock('./session/state', () => ({
  useScenarioControllerState: controllerMocks.useScenarioControllerState,
  useScenarioSessionRefresh: controllerMocks.useScenarioSessionRefresh,
}));

vi.mock('./runtime', () => ({
  buildScenarioControllerViewState: controllerMocks.buildScenarioControllerViewState,
  useScenarioControllerRuntime: controllerMocks.useScenarioControllerRuntime,
}));

import { useScenarioController } from './controller';
import {
  createDefaultScenarioSession,
  createDefaultScenarioSurfaceState,
} from './session/defaults';

type ControllerParams = Parameters<typeof useScenarioController>[0];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness({ params }: { params: ControllerParams }) {
  useScenarioController(params);
  return null;
}

async function renderHarness(params: ControllerParams) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<Harness params={params} />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useScenarioController orchestration', () => {
  it('connects state and runtime to all three exact effect owners', async () => {
    const session = createDefaultScenarioSession();
    const surface = createDefaultScenarioSurfaceState();
    const applyScenarioResponse = vi.fn();
    const refreshSession = vi.fn(async () => undefined);
    const buildCapturePayload = vi.fn();
    const saveSelectionCapture = vi.fn(async () => undefined);
    const setIsCompletelyHidden = vi.fn();
    const setNavigationLockEnabled = vi.fn();
    const controllerState = {
      applyScenarioResponse,
      effectiveSession: session,
      optimisticCaptureMode: null,
      projects: [],
      recentSteps: [],
      recentStepHighlightToken: 0,
      session,
      sessionRef: { current: session },
      setOptimisticCaptureMode: vi.fn(),
      trashedSteps: [],
      surface,
      surfaceRef: { current: surface },
    };
    controllerMocks.useScenarioControllerState.mockReturnValue(controllerState);
    controllerMocks.useScenarioSessionRefresh.mockReturnValue(refreshSession);
    controllerMocks.useScenarioControllerRuntime.mockReturnValue({
      buildCapturePayload,
      controllerActions: {},
      ensureCaptureReady: vi.fn(async () => undefined),
      saveSelectionCapture,
    });
    controllerMocks.buildScenarioControllerViewState.mockReturnValue({});

    await renderHarness({
      autoClickBlocked: false,
      captureActionRef: { current: 'download_default' },
      navigationLockEnabled: true,
      screenshotMode: true,
      setCaptureAction: vi.fn(),
      setIsCompletelyHidden,
      setIsToolbarVisible: vi.fn(),
      setNavigationLockEnabled,
      setScreenshotMode: vi.fn(),
    });

    expect(controllerMocks.useScenarioSuggestedEventLogging).toHaveBeenCalledWith({
      pendingProjectSelection: false,
      projectId: null,
      scenarioEnabled: false,
      screenshotMode: true,
    });
    expect(controllerMocks.useScenarioNavigationLockOverride).toHaveBeenCalledWith({
      navigationLockEnabled: true,
      pendingProjectSelection: false,
      scenarioCaptureMode: 'manual',
      scenarioEnabled: false,
      screenshotMode: true,
      setNavigationLockEnabled,
    });
    expect(controllerMocks.useScenarioAutoClickCapture).toHaveBeenCalledWith({
      blocked: false,
      buildCapturePayload,
      refreshSession,
      screenshotMode: true,
      session,
      setIsCompletelyHidden,
    });
  });
});
