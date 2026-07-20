// @vitest-environment jsdom

import { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';

const lockMocks = vi.hoisted(() => ({
  disableNavigationLock: vi.fn(),
  enableNavigationLock: vi.fn(),
  registerScenarioSuggestedEventListeners: vi.fn(() => vi.fn()),
  restoreNavigationLockState: vi.fn(),
}));

vi.mock('../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal()),
  disableNavigationLock: lockMocks.disableNavigationLock,
  enableNavigationLock: lockMocks.enableNavigationLock,
  setUIHidden: vi.fn(),
}));

vi.mock('../screenshot/bridge', async (importOriginal) => ({
  ...(await importOriginal()),
  restoreNavigationLockState: lockMocks.restoreNavigationLockState,
}));

vi.mock('./suggested-event-logging/helpers', () => ({
  registerScenarioSuggestedEventListeners: lockMocks.registerScenarioSuggestedEventListeners,
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal()),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal()),
  addEventListenerToAllWindowsDynamic: vi.fn(() => () => undefined),
  addScrollListenersToAllWindows: vi.fn(() => () => undefined),
  resolveIframeEventTarget: vi.fn(() => null),
}));

vi.mock('../../platform/frame/core', async (importOriginal) => ({
  ...(await importOriginal()),
  getViewportClientPoint: vi.fn(),
}));

vi.mock('../scenario-recorder/runtime', async (importOriginal) => ({
  ...(await importOriginal()),
  buildScenarioPoint: vi.fn(),
  buildScenarioTargetDescriptor: vi.fn(),
  describeScenarioTarget: vi.fn(),
  formatShortcutLabel: vi.fn(),
  isScenarioEligibleInteractionTarget: vi.fn(() => false),
}));

import { useScenarioNavigationLockOverride, useScenarioSuggestedEventLogging } from './effects';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function ScenarioLockHarness(props: {
  navigationLockEnabled: boolean;
  pendingProjectSelection: boolean;
  scenarioCaptureMode: ScenarioSessionState['captureMode'];
  scenarioEnabled: boolean;
  screenshotMode: boolean;
  setNavigationLockEnabled: (enabled: boolean) => void;
}) {
  useScenarioNavigationLockOverride(props);

  useEffect(() => undefined, []);
  return null;
}

function ScenarioSuggestedEventLoggingHarness(props: {
  pendingProjectSelection: boolean;
  projectId: string | null;
  scenarioEnabled: boolean;
  screenshotMode: boolean;
}) {
  useScenarioSuggestedEventLogging(props);

  useEffect(() => undefined, []);
  return null;
}

async function renderHarness(props: React.ComponentProps<typeof ScenarioLockHarness>) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ScenarioLockHarness {...props} />);
  });
}

async function renderSuggestedEventLoggingHarness(
  props: React.ComponentProps<typeof ScenarioSuggestedEventLoggingHarness>
) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ScenarioSuggestedEventLoggingHarness {...props} />);
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
  vi.restoreAllMocks();
});

describe('useScenarioNavigationLockOverride active capture', () => {
  it('disables the navigation lock while by-click scenario capture is active and restores it on exit', async () => {
    const setNavigationLockEnabled = vi.fn();

    await renderHarness({
      navigationLockEnabled: true,
      pendingProjectSelection: false,
      scenarioCaptureMode: 'by-click',
      scenarioEnabled: true,
      screenshotMode: true,
      setNavigationLockEnabled,
    });

    expect(lockMocks.restoreNavigationLockState).toHaveBeenCalledWith(
      false,
      setNavigationLockEnabled
    );

    await renderHarness({
      navigationLockEnabled: false,
      pendingProjectSelection: false,
      scenarioCaptureMode: 'manual',
      scenarioEnabled: true,
      screenshotMode: true,
      setNavigationLockEnabled,
    });

    expect(lockMocks.restoreNavigationLockState).toHaveBeenLastCalledWith(
      true,
      setNavigationLockEnabled
    );
  });
});

describe('useScenarioNavigationLockOverride disabled state', () => {
  it('does not restore the lock when it was already disabled before by-click mode started', async () => {
    const setNavigationLockEnabled = vi.fn();

    await renderHarness({
      navigationLockEnabled: false,
      pendingProjectSelection: false,
      scenarioCaptureMode: 'by-click',
      scenarioEnabled: true,
      screenshotMode: true,
      setNavigationLockEnabled,
    });

    expect(lockMocks.restoreNavigationLockState).not.toHaveBeenCalled();

    await renderHarness({
      navigationLockEnabled: false,
      pendingProjectSelection: false,
      scenarioCaptureMode: 'by-click',
      scenarioEnabled: false,
      screenshotMode: true,
      setNavigationLockEnabled,
    });

    expect(lockMocks.restoreNavigationLockState).not.toHaveBeenCalled();
  });
});

describe('useScenarioSuggestedEventLogging', () => {
  it('subscribes only while screenshot scenario logging is active and uses the latest project id', async () => {
    const cleanup = vi.fn();
    lockMocks.registerScenarioSuggestedEventListeners.mockReturnValueOnce(cleanup);

    await renderSuggestedEventLoggingHarness({
      pendingProjectSelection: false,
      projectId: 'project-1',
      scenarioEnabled: true,
      screenshotMode: true,
    });

    expect(lockMocks.registerScenarioSuggestedEventListeners).toHaveBeenCalledWith('project-1');

    await renderSuggestedEventLoggingHarness({
      pendingProjectSelection: false,
      projectId: 'project-2',
      scenarioEnabled: true,
      screenshotMode: true,
    });

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(lockMocks.registerScenarioSuggestedEventListeners).toHaveBeenLastCalledWith('project-2');
  });

  it('does not subscribe while pending project selection blocks scenario logging', async () => {
    await renderSuggestedEventLoggingHarness({
      pendingProjectSelection: true,
      projectId: 'project-1',
      scenarioEnabled: true,
      screenshotMode: true,
    });

    expect(lockMocks.registerScenarioSuggestedEventListeners).not.toHaveBeenCalled();
  });
});
