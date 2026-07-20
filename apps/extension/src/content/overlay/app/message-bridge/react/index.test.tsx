// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const diagnosticController = {
    disable: vi.fn(),
    dispose: vi.fn(),
    enable: vi.fn(),
  };

  return {
    buildRuntimeMessageBridgeParams: vi.fn(() => ({ bridge: 'params' })),
    createDiagnosticLoggerController: vi.fn(() => diagnosticController),
    diagnosticController,
    useRuntimeMessageBridge: vi.fn(),
  };
});

vi.mock('../../../../application/diagnostics/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../application/diagnostics/runtime')>()),
  createDiagnosticLoggerController: mocks.createDiagnosticLoggerController,
}));

vi.mock('../../view-state/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../view-state/helpers')>()),
  buildRuntimeMessageBridgeParams: mocks.buildRuntimeMessageBridgeParams,
}));

vi.mock('..', () => ({
  useRuntimeMessageBridge: mocks.useRuntimeMessageBridge,
}));

import type { ContentRuntimeBridgeParams } from '../../view-state/helpers';
import { useContentRuntimeBridge } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let currentArgs: {
  disableAiPickMode: () => void;
  params: ContentRuntimeBridgeParams;
} | null = null;

function createRuntimeBridgeParams(): ContentRuntimeBridgeParams {
  return {
    handleTakeScreenshot: vi.fn(async () => undefined),
    invalidateScreenshotRuns: vi.fn(),
    modeControls: {
      setAiPickMode: vi.fn(),
      setHighlighterMode: vi.fn(),
      setIsToolbarVisible: vi.fn(),
      setNavigationLockEnabled: vi.fn(),
      setQuickEditDocumentMode: vi.fn(),
      setQuickEditMode: vi.fn(),
      setScreenshotMode: vi.fn(),
    },
    modeFlags: {
      aiPickMode: false,
      highlighterMode: false,
      quickEditDocumentMode: false,
      quickEditMode: false,
      screenshotMode: false,
    },
    quickActionState: {
      captureAction: 'download_default',
      captureActionRef: { current: 'download_default' },
      quickActionOverlayRef: { current: null },
      setCaptureAction: vi.fn(),
      setQuickActionOverlay: vi.fn(),
      setQuickActionToastCountdown: vi.fn(),
      setTimerDelay: vi.fn(),
      timerDelay: 0,
    },
    viewportState: {
      currentViewport: null,
      setCurrentViewport: vi.fn(),
    },
    visibilityState: {
      clearPendingAutoStartCapture: vi.fn(),
      isCompletelyHidden: false,
      isToolbarVisible: false,
      navigationLockEnabled: false,
      pendingAutoStartCapture: null,
      queueAutoStartCapture: vi.fn(),
      saveDialogState: null,
      setIsCompletelyHidden: vi.fn(),
      setSaveDialogState: vi.fn(),
    },
  };
}

function Harness() {
  useContentRuntimeBridge(
    currentArgs?.params ?? createRuntimeBridgeParams(),
    currentArgs?.disableAiPickMode ?? vi.fn()
  );
  return null;
}

async function renderHarness(args: {
  disableAiPickMode: () => void;
  params: ContentRuntimeBridgeParams;
}) {
  currentArgs = args;

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.buildRuntimeMessageBridgeParams.mockClear();
  mocks.createDiagnosticLoggerController.mockClear();
  mocks.diagnosticController.disable.mockClear();
  mocks.diagnosticController.dispose.mockClear();
  mocks.diagnosticController.enable.mockClear();
  mocks.useRuntimeMessageBridge.mockClear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  currentArgs = null;
  vi.unstubAllGlobals();
});

async function expectBridgeOwnerLifecycle() {
  const firstParams = createRuntimeBridgeParams();
  const secondParams = createRuntimeBridgeParams();
  const disableAiPickMode = vi.fn();

  await renderHarness({ disableAiPickMode, params: firstParams });
  await renderHarness({ disableAiPickMode, params: secondParams });

  expect(mocks.createDiagnosticLoggerController).toHaveBeenCalledTimes(1);
  expect(mocks.buildRuntimeMessageBridgeParams).toHaveBeenNthCalledWith(
    1,
    firstParams,
    mocks.diagnosticController,
    disableAiPickMode
  );
  expect(mocks.buildRuntimeMessageBridgeParams).toHaveBeenNthCalledWith(
    2,
    secondParams,
    mocks.diagnosticController,
    disableAiPickMode
  );
  expect(mocks.useRuntimeMessageBridge).toHaveBeenNthCalledWith(1, { bridge: 'params' });
  expect(mocks.useRuntimeMessageBridge).toHaveBeenNthCalledWith(2, { bridge: 'params' });
}

async function expectBridgeOwnerDisposeOnUnmount() {
  await renderHarness({
    disableAiPickMode: vi.fn(),
    params: createRuntimeBridgeParams(),
  });

  act(() => {
    root?.unmount();
  });

  expect(mocks.diagnosticController.dispose).toHaveBeenCalledTimes(1);
  root = null;
}

function runUseContentRuntimeBridgeSuite() {
  it(
    'creates one diagnostics controller and rebuilds runtime bridge params with the latest inputs',
    expectBridgeOwnerLifecycle
  );
  it(
    'disposes the diagnostics controller when the hook owner unmounts',
    expectBridgeOwnerDisposeOnUnmount
  );
}

describe('useContentRuntimeBridge', runUseContentRuntimeBridgeSuite);
