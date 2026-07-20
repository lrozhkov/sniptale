// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import type { ScenarioSessionState } from '@sniptale/runtime-contracts/scenario/types/session';
import type { BuildScenarioCapturePayload } from './types';

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedKeyboardEvent: vi.fn(() => true),
  isTrustedMouseEvent: vi.fn(() => true),
  isTrustedPointerEvent: vi.fn(() => true),
}));

vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  isTrustedKeyboardEvent: trustedEventMocks.isTrustedKeyboardEvent,
  isTrustedMouseEvent: trustedEventMocks.isTrustedMouseEvent,
  isTrustedPointerEvent: trustedEventMocks.isTrustedPointerEvent,
}));

import { useScenarioAutoClickCapture } from '.';

type BuildCapturePayloadMock = ReturnType<typeof vi.fn> & BuildScenarioCapturePayload;
type ScenarioAutoClickListenerArgs = {
  clickReplayHandler: (event: MouseEvent) => void;
  keyboardCaptureHandler: (event: KeyboardEvent, iframe?: HTMLIFrameElement) => void;
  pointerDownHandler: (event: PointerEvent, iframe?: HTMLIFrameElement) => void;
  pointerMoveHandler: (event: PointerEvent, iframe?: HTMLIFrameElement) => void;
  pointerUpHandler: (event: PointerEvent, iframe?: HTMLIFrameElement) => void;
};

const domDriverMocks = vi.hoisted(() => {
  const cleanup = vi.fn();

  return {
    cleanup,
    registerScenarioAutoClickListeners: vi.fn<(args: ScenarioAutoClickListenerArgs) => () => void>(
      () => cleanup
    ),
  };
});

vi.mock('./dom-driver', async () => {
  const actual = await vi.importActual<typeof import('./dom-driver')>('./dom-driver');

  return {
    ...actual,
    registerScenarioAutoClickListeners: domDriverMocks.registerScenarioAutoClickListeners,
  };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSession(overrides: Partial<ScenarioSessionState> = {}): ScenarioSessionState {
  return {
    captureMode: 'by-click',
    enabled: true,
    pendingProjectSelection: false,
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    sidebarVisible: true,
    ...overrides,
  };
}

function Harness(props: {
  blocked?: boolean;
  buildCapturePayload?: BuildScenarioCapturePayload;
  screenshotMode?: boolean;
  session?: ScenarioSessionState;
}) {
  useScenarioAutoClickCapture({
    blocked: props.blocked ?? false,
    buildCapturePayload: props.buildCapturePayload ?? ((() => null) as BuildScenarioCapturePayload),
    refreshSession: vi.fn(async () => undefined),
    screenshotMode: props.screenshotMode ?? true,
    session: props.session ?? createSession(),
    setIsCompletelyHidden: vi.fn(),
  });

  return null;
}

async function renderHarness(props: React.ComponentProps<typeof Harness>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness {...props} />);
  });
}

function createEnterEvent(target: HTMLElement) {
  const event = new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' });
  Object.defineProperty(event, 'target', { configurable: true, value: target });
  Object.defineProperty(event, 'composedPath', {
    configurable: true,
    value: () => [target],
  });
  return event;
}

function createPointerEvent(type: 'pointerdown' | 'pointerup', target: HTMLElement) {
  const event = new PointerEvent(type, { bubbles: true, button: 0, clientX: 16, clientY: 16 });
  Object.defineProperty(event, 'target', { configurable: true, value: target });
  Object.defineProperty(event, 'composedPath', {
    configurable: true,
    value: () => [target],
  });
  return event;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  trustedEventMocks.isTrustedKeyboardEvent.mockReturnValue(true);
  trustedEventMocks.isTrustedMouseEvent.mockReturnValue(true);
  trustedEventMocks.isTrustedPointerEvent.mockReturnValue(true);
  domDriverMocks.cleanup.mockReset();
  domDriverMocks.registerScenarioAutoClickListeners.mockClear();
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

function registerStableScenarioAutoClickListenerTests() {
  it('keeps the listener registration stable across rerenders and uses the latest session state', async () => {
    const initialBuildCapturePayload = vi.fn(() => null) as BuildCapturePayloadMock;
    const nextBuildCapturePayload = vi.fn(() => null) as BuildCapturePayloadMock;
    const target = document.createElement('button');
    target.textContent = 'Submit';
    document.body.appendChild(target);

    await renderHarness({
      buildCapturePayload: initialBuildCapturePayload,
      session: createSession(),
    });

    expect(domDriverMocks.registerScenarioAutoClickListeners).toHaveBeenCalledTimes(1);

    await renderHarness({
      buildCapturePayload: nextBuildCapturePayload,
      session: createSession({ captureMode: 'manual' }),
    });

    expect(domDriverMocks.registerScenarioAutoClickListeners).toHaveBeenCalledTimes(1);

    const listenerArgs = domDriverMocks.registerScenarioAutoClickListeners.mock.calls[0]?.[0] as
      | ScenarioAutoClickListenerArgs
      | undefined;
    listenerArgs?.keyboardCaptureHandler(createEnterEvent(target));

    expect(initialBuildCapturePayload).not.toHaveBeenCalled();
    expect(nextBuildCapturePayload).not.toHaveBeenCalled();

    await renderHarness({
      buildCapturePayload: nextBuildCapturePayload,
      session: createSession({ captureMode: 'by-click' }),
    });

    listenerArgs?.keyboardCaptureHandler(createEnterEvent(target));

    expect(domDriverMocks.registerScenarioAutoClickListeners).toHaveBeenCalledTimes(1);
    expect(initialBuildCapturePayload).not.toHaveBeenCalled();
    expect(nextBuildCapturePayload).toHaveBeenCalledTimes(1);
  });
}

function registerSidebarPreviewBypassTests() {
  it('ignores extension-owned sidebar preview interactions while the fullscreen preview overlay is open', async () => {
    const buildCapturePayload = vi.fn(() => null) as BuildCapturePayloadMock;
    const contentRoot = document.createElement('div');
    contentRoot.id = CONTENT_ROOT_ID;
    const shadowRoot = contentRoot.attachShadow({ mode: 'open' });
    const previewButton = document.createElement('button');
    previewButton.textContent = 'Preview';
    const previewOverlay = document.createElement('div');
    previewOverlay.dataset['ui'] = 'content.scenario.sidebar.floating-preview';
    shadowRoot.append(previewButton, previewOverlay);
    document.body.appendChild(contentRoot);

    await renderHarness({
      buildCapturePayload,
      session: createSession({ captureMode: 'by-click' }),
    });

    const listenerArgs = domDriverMocks.registerScenarioAutoClickListeners.mock.calls[0]?.[0] as
      | ScenarioAutoClickListenerArgs
      | undefined;

    listenerArgs?.pointerDownHandler(createPointerEvent('pointerdown', previewButton));
    listenerArgs?.pointerUpHandler(createPointerEvent('pointerup', previewButton));
    listenerArgs?.keyboardCaptureHandler(createEnterEvent(previewButton));

    expect(buildCapturePayload).not.toHaveBeenCalled();
  });
}

describe('useScenarioAutoClickCapture', () => {
  registerStableScenarioAutoClickListenerTests();
  registerSidebarPreviewBypassTests();
});
