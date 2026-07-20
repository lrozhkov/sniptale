// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ContentAppModeState } from '../../../content/overlay/app/mode';
import { createModeState } from './mode-state.test-support';
import { PreparationSurface, type PreparationHostPorts } from '.';

type PortListener = (command: {
  type: string;
  viewport?: { width: number; height: number };
}) => void;
type RuntimeLayoutProps = {
  dialogs: {
    aiController: unknown;
    handleCancelCountdown: unknown;
  };
  toolbar: {
    aiController: unknown;
    handleTakeScreenshot: unknown;
  };
};
type ScreenshotControllerMockArgs = {
  editingModes: {
    disableHighlighterMode: () => void;
  };
};

const runtimeMocks = vi.hoisted(() => {
  const frameManager = {
    addFrame: vi.fn(),
    clearFrames: vi.fn(),
    frames: [],
    hasFrameForElement: vi.fn(() => false),
    removeFrame: vi.fn(),
  };
  const createScenarioController = () => ({
    buildManualCapturePayload: vi.fn(),
    ensureCaptureReady: vi.fn(),
    refreshSession: vi.fn(),
    saveSelectionCapture: vi.fn(),
  });
  const captureAdapter = {
    captureSelection: vi.fn(),
    captureViewport: vi.fn(),
  };
  return {
    ContentAppLayout: vi.fn((_props: RuntimeLayoutProps) => null),
    captureAdapter,
    connectPort: vi.fn(),
    createScenarioAutoClickCaptureTransport: vi.fn(() => vi.fn()),
    createScenarioAutoClickListenerRegistry: vi.fn(() => vi.fn()),
    createScenarioCaptureSourceAdapter: vi.fn(() => ({
      buildPageDescriptor: vi.fn(),
      buildTargetDescriptor: vi.fn(),
    })),
    frameManager,
    disableHighlighterMode: vi.fn(),
    handleTakeScreenshot: vi.fn().mockResolvedValue(undefined),
    modeState: null as ContentAppModeState | null,
    registerFrameCallbacks: vi.fn(),
    resolveAiPickSource: vi.fn(),
    useAiPickController: vi.fn(() => ({ handleDisableAiPickMode: vi.fn() })),
    useAutoBlurController: vi.fn(() => ({})),
    useContentScreenshotAutoStart: vi.fn(),
    useScenarioController: vi.fn(createScenarioController),
    useScreenshotController: vi.fn((_args: ScreenshotControllerMockArgs) => ({
      countdown: null,
      handleCancelCountdown: vi.fn(),
      handleTakeScreenshot: runtimeMocks.handleTakeScreenshot,
      invalidateScreenshotRuns: vi.fn(),
    })),
    useContentAppBindings: vi.fn(() => frameManager),
    useContentModeFlags: vi.fn(() => runtimeMocks.modeState),
    useContentSurfaceState: vi.fn(() => runtimeMocks.modeState),
    useToolbarModeController: vi.fn(() => ({})),
  };
});

vi.mock('../../../content/overlay/app-layout', () => ({
  ContentAppLayout: runtimeMocks.ContentAppLayout,
}));
vi.mock('../../../content/overlay/ai/pick/controller', () => ({
  useAiPickController: runtimeMocks.useAiPickController,
}));
vi.mock('../../../content/overlay/app/content-mode/state/flags', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../content/overlay/app/content-mode/state/flags')
  >()),
  useContentModeFlags: runtimeMocks.useContentModeFlags,
}));
vi.mock('../../../content/overlay/app/content-mode/state/surface', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../content/overlay/app/content-mode/state/surface')
  >()),
  useContentSurfaceState: runtimeMocks.useContentSurfaceState,
}));
vi.mock('../../../content/overlay/auto-blur/controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content/overlay/auto-blur/controller')>()),
  useAutoBlurController: runtimeMocks.useAutoBlurController,
}));
vi.mock('../../../content/overlay/app/bindings', () => ({
  useContentAppBindings: runtimeMocks.useContentAppBindings,
}));
vi.mock('../../../content/overlay/screenshot/auto-start', () => ({
  useContentScreenshotAutoStart: runtimeMocks.useContentScreenshotAutoStart,
}));
vi.mock('../../../content/overlay/scenario/controller', () => ({
  useScenarioController: runtimeMocks.useScenarioController,
}));
vi.mock('../../../content/overlay/screenshot/controller', () => ({
  useScreenshotController: runtimeMocks.useScreenshotController,
}));
vi.mock('../../../content/overlay/toolbar/mode-controller', () => ({
  useToolbarModeController: runtimeMocks.useToolbarModeController,
}));
vi.mock('../../../content/selection/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content/selection/highlighter')>()),
  disableHighlighterMode: runtimeMocks.disableHighlighterMode,
  registerFrameCallbacks: runtimeMocks.registerFrameCallbacks,
}));
vi.mock('../../../content/selection/quick-edit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content/selection/quick-edit')>()),
  disableQuickEditMode: vi.fn(),
}));
vi.mock('../../../content/overlay/ai/pick/runtime/lazy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../content/overlay/ai/pick/runtime/lazy')>()),
  disableAiPickModeIfLoaded: vi.fn(),
}));

let container: HTMLDivElement | null = null;
let iframe: HTMLIFrameElement | null = null;
let root: Root | null = null;
let portListener: PortListener | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  iframe = document.createElement('iframe');
  document.body.append(container, iframe);
  root = createRoot(container);
  runtimeMocks.modeState = createModeState();
  runtimeMocks.connectPort.mockImplementation((listener: PortListener) => {
    portListener = listener;
    return vi.fn();
  });
});

afterEach(() => {
  act(() => root?.unmount());
  iframe?.remove();
  container?.remove();
  root = null;
  iframe = null;
  container = null;
  portListener = null;
  vi.unstubAllGlobals();
});

it('routes preparation enable commands through screenshot-mode state without enabling highlighter', () => {
  renderSurface();

  act(() => {
    portListener?.({
      type: MessageType.ENABLE_SCREENSHOT_MODE,
      viewport: { width: 1280, height: 720 },
    });
  });

  expect(runtimeMocks.modeState?.setScreenshotMode).toHaveBeenCalledWith(true);
  expect(runtimeMocks.modeState?.setNavigationLockEnabled).toHaveBeenCalledWith(true);
  expect(runtimeMocks.modeState?.setIsToolbarVisible).toHaveBeenCalledWith(true);
  expect(runtimeMocks.modeState?.setCurrentViewport).toHaveBeenCalledWith({
    width: 1280,
    height: 720,
  });
  expect(runtimeMocks.ContentAppLayout).toHaveBeenCalled();
});

it('wires screenshot, AI, dialogs, and quick-action auto-start controllers through host ports', () => {
  renderSurface();
  const latestLayoutProps = runtimeMocks.ContentAppLayout.mock.calls.at(-1)?.[0];
  if (!latestLayoutProps) {
    throw new Error('Expected content app layout props.');
  }
  const { toolbar: toolbarProps, dialogs: dialogProps } = latestLayoutProps;

  expect(runtimeMocks.useAiPickController).toHaveBeenCalledWith(
    expect.objectContaining({
      aiPickSource: runtimeMocks.resolveAiPickSource,
      setAiPickMode: runtimeMocks.modeState?.setAiPickMode,
    })
  );
  expect(runtimeMocks.useScreenshotController).toHaveBeenCalledWith(
    expect.objectContaining({
      captureAdapter: runtimeMocks.captureAdapter,
      editingModes: expect.objectContaining({
        highlighterMode: runtimeMocks.modeState?.highlighterMode,
        quickEditMode: runtimeMocks.modeState?.quickEditMode,
        setHighlighterMode: runtimeMocks.modeState?.setHighlighterMode,
      }),
      scenario: expect.objectContaining({
        buildCapturePayload: expect.any(Function),
        refreshSession: expect.any(Function),
        saveSelectionCapture: expect.any(Function),
      }),
      setQuickActionOverlay: runtimeMocks.modeState?.setQuickActionOverlay,
    })
  );
  expect(runtimeMocks.useScenarioController).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceAdapter: expect.objectContaining({
        buildPageDescriptor: expect.any(Function),
        buildTargetDescriptor: expect.any(Function),
      }),
    })
  );
  expect(runtimeMocks.useContentScreenshotAutoStart).toHaveBeenCalledWith(
    expect.objectContaining({
      handleTakeScreenshot: runtimeMocks.handleTakeScreenshot,
    })
  );
  expect(toolbarProps.handleTakeScreenshot).toBe(runtimeMocks.handleTakeScreenshot);
  expect(toolbarProps.aiController).toBe(dialogProps.aiController);
  expect(dialogProps.handleCancelCountdown).toBeDefined();
});

it('tears down highlighter runtime when preparation screenshot capture disables editing modes', () => {
  renderSurface();
  const screenshotArgs = runtimeMocks.useScreenshotController.mock.calls.at(-1)?.[0];

  screenshotArgs?.editingModes.disableHighlighterMode();

  expect(runtimeMocks.disableHighlighterMode).toHaveBeenCalledOnce();
  expect(runtimeMocks.modeState?.setHighlighterMode).toHaveBeenCalledWith(false);
});

it('applies preparation viewport commands to mode state without taking screenshots', () => {
  renderSurface();

  act(() => {
    portListener?.({
      type: MessageType.SET_VIEWPORT,
      viewport: { width: 390, height: 844 },
    });
  });

  expect(runtimeMocks.modeState?.setCurrentViewport).toHaveBeenCalledWith({
    width: 390,
    height: 844,
  });
  expect(runtimeMocks.modeState?.setScreenshotMode).not.toHaveBeenCalledWith(true);
  expect(runtimeMocks.handleTakeScreenshot).not.toHaveBeenCalled();
});

it('keeps frame creation and hover eligibility inside accepted host elements', () => {
  renderSurface();
  const [addFrame, _removeFrame, _clearFrames, hasFrameForElement] =
    runtimeMocks.registerFrameCallbacks.mock.calls.at(-1)!;
  const acceptedTarget = iframe!.contentDocument!.createElement('button');
  const outsideTarget = document.createElement('button');

  addFrame(acceptedTarget);
  addFrame(outsideTarget);

  expect(runtimeMocks.frameManager.addFrame).toHaveBeenCalledTimes(1);
  expect(runtimeMocks.frameManager.addFrame).toHaveBeenCalledWith(acceptedTarget);
  expect(hasFrameForElement(acceptedTarget)).toBe(false);
  expect(hasFrameForElement(outsideTarget)).toBe(true);
});

function createPorts(): PreparationHostPorts {
  return {
    acceptsElement: (element) => element.ownerDocument === iframe?.contentDocument,
    connectPort: runtimeMocks.connectPort,
    createCaptureAdapter: () => runtimeMocks.captureAdapter,
    createScenarioAutoClickCaptureTransport: runtimeMocks.createScenarioAutoClickCaptureTransport,
    createScenarioAutoClickListenerRegistry: runtimeMocks.createScenarioAutoClickListenerRegistry,
    createScenarioCaptureSourceAdapter: runtimeMocks.createScenarioCaptureSourceAdapter,
    onPopupExportRequest: vi.fn(),
    resolveAiPickSource: runtimeMocks.resolveAiPickSource,
  };
}

function renderSurface() {
  act(() => {
    root?.render(<PreparationSurface ports={createPorts()} />);
  });
}
