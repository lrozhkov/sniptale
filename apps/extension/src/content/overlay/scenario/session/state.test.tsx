// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../../application/runtime-services/services.test-support';

const { loggerErrorMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import { createDefaultScenarioRestoreSnapshot } from './defaults';
import { useScenarioControllerState, useScenarioSessionRefresh } from './state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
const captureActionRef = { current: 'download_default' as const };
const setCaptureActionMock = vi.fn();
const setIsToolbarVisibleMock = vi.fn();
const setScreenshotModeMock = vi.fn();
let lastControllerState: ReturnType<typeof useScenarioControllerState> | null = null;
let lastRefreshSession: ReturnType<typeof useScenarioSessionRefresh> | null = null;

function TestScenarioState() {
  const controllerState = useScenarioControllerState({
    captureActionRef,
    setCaptureAction: setCaptureActionMock,
    setIsToolbarVisible: setIsToolbarVisibleMock,
    setScreenshotMode: setScreenshotModeMock,
  });
  lastControllerState = controllerState;

  lastRefreshSession = useScenarioSessionRefresh(controllerState.applyScenarioResponse);
  return null;
}

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderScenarioState() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<TestScenarioState />);
    await flushEffects();
  });
}

describe('useScenarioSessionRefresh', () => {
  beforeEach(prepareScenarioSessionRefreshTest);
  afterEach(cleanupScenarioSessionRefreshTest);
  registerScenarioBaseRefreshTests();
  registerScenarioBfcacheRefreshTests();
});

function createSnapshotResponse() {
  return {
    snapshot: createDefaultScenarioRestoreSnapshot(),
    recentSteps: [
      {
        id: 'step-1',
        position: 0,
        previewDataUrl: 'data:image/png;base64,1',
        title: 'Step 1',
      },
    ],
    trashedSteps: [
      {
        id: 'step-2',
        deletedAt: 20,
        kind: 'capture' as const,
        originalIndex: 1,
        title: 'Step 2',
      },
    ],
  };
}

function createForcedScenarioSnapshotResponse() {
  const response = createSnapshotResponse();
  return {
    ...response,
    snapshot: {
      ...response.snapshot,
      session: {
        ...response.snapshot.session,
        enabled: true,
      },
      surface: {
        captureAction: 'scenario' as const,
        screenshotMode: true,
        toolbarVisible: true,
      },
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function dispatchPersistedPageShow() {
  const event = new Event('pageshow') as PageTransitionEvent;
  Object.defineProperty(event, 'persisted', { value: true });
  window.dispatchEvent(event);
}

function prepareScenarioSessionRefreshTest() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessageMock);
  captureActionRef.current = 'download_default';
  sendRuntimeMessageMock.mockResolvedValue({
    success: true,
    ...createSnapshotResponse(),
  });
}

function cleanupScenarioSessionRefreshTest() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  lastControllerState = null;
  lastRefreshSession = null;
  vi.unstubAllGlobals();
}

async function expectRestoreSnapshotRequestDoesNotLoop() {
  await renderScenarioState();
  await renderScenarioState();

  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(1);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'SCENARIO_GET_RESTORE_SNAPSHOT',
  });
}

async function expectRestoreSnapshotAppliesSteps() {
  await renderScenarioState();

  expect(lastControllerState?.recentSteps).toEqual([
    {
      id: 'step-1',
      position: 0,
      previewDataUrl: 'data:image/png;base64,1',
      title: 'Step 1',
    },
  ]);
  expect(lastControllerState?.trashedSteps).toEqual([
    {
      id: 'step-2',
      deletedAt: 20,
      kind: 'capture',
      originalIndex: 1,
      title: 'Step 2',
    },
  ]);
}

async function expectRefreshFailureLogsWithoutRetry() {
  const error = new Error('restore failed');
  sendRuntimeMessageMock.mockRejectedValue(error);

  await renderScenarioState();
  await renderScenarioState();

  expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(1);
  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to refresh scenario session state', error);
}

async function expectStaleRefreshGuardSkipsRestoreResponse() {
  await renderScenarioState();
  setCaptureActionMock.mockClear();
  setScreenshotModeMock.mockClear();
  setIsToolbarVisibleMock.mockClear();
  sendRuntimeMessageMock.mockResolvedValueOnce({
    success: true,
    ...createForcedScenarioSnapshotResponse(),
  });

  await act(async () => {
    await lastRefreshSession?.(() => false);
    await flushEffects();
  });

  expect(setCaptureActionMock).not.toHaveBeenCalled();
  expect(setScreenshotModeMock).not.toHaveBeenCalled();
  expect(setIsToolbarVisibleMock).not.toHaveBeenCalled();
}

function registerScenarioBaseRefreshTests() {
  it(
    'requests the restore snapshot once and does not loop',
    expectRestoreSnapshotRequestDoesNotLoop
  );
  it('applies recent and trashed steps from snapshots', expectRestoreSnapshotAppliesSteps);
  it('logs refresh failures without retrying in a loop', expectRefreshFailureLogsWithoutRetry);
  it(
    'skips restore responses when caller guard is stale',
    expectStaleRefreshGuardSkipsRestoreResponse
  );
}

function registerScenarioBfcacheRefreshTests() {
  it('refreshes scenario surface after browser history restores the page from cache', async () => {
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true, ...createSnapshotResponse() })
      .mockResolvedValueOnce({ success: true, ...createForcedScenarioSnapshotResponse() });

    await renderScenarioState();
    await act(async () => {
      dispatchPersistedPageShow();
      await flushEffects();
    });

    expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(2);
    expect(setCaptureActionMock).toHaveBeenLastCalledWith('scenario');
    expect(setScreenshotModeMock).toHaveBeenLastCalledWith(true);
    expect(setIsToolbarVisibleMock).toHaveBeenLastCalledWith(true);
  });

  it('ignores stale restore responses when BFCache refresh finishes first', async () => {
    const firstRestore = createDeferred<unknown>();
    const bfcacheRestore = createDeferred<unknown>();
    sendRuntimeMessageMock
      .mockReturnValueOnce(firstRestore.promise)
      .mockReturnValueOnce(bfcacheRestore.promise);

    await renderScenarioState();
    await act(async () => {
      dispatchPersistedPageShow();
      await flushEffects();
    });

    await act(async () => {
      bfcacheRestore.resolve({ success: true, ...createForcedScenarioSnapshotResponse() });
      await flushEffects();
    });
    await act(async () => {
      firstRestore.resolve({ success: true, ...createSnapshotResponse() });
      await flushEffects();
    });

    expect(sendRuntimeMessageMock).toHaveBeenCalledTimes(2);
    expect(setCaptureActionMock).toHaveBeenLastCalledWith('scenario');
    expect(setScreenshotModeMock).toHaveBeenLastCalledWith(true);
    expect(setIsToolbarVisibleMock).toHaveBeenLastCalledWith(true);
  });
}
