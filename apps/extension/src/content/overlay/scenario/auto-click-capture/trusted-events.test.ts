// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const { sendRuntimeMessageMock, setUIHiddenMock } = vi.hoisted(() => ({
  sendRuntimeMessageMock: vi.fn(),
  setUIHiddenMock: vi.fn(),
}));

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedKeyboardEvent: vi.fn(() => true),
  isTrustedMouseEvent: vi.fn(() => true),
  isTrustedPointerEvent: vi.fn(() => true),
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/locker')>()),
  setUIHidden: setUIHiddenMock,
}));

vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  isTrustedKeyboardEvent: trustedEventMocks.isTrustedKeyboardEvent,
  isTrustedMouseEvent: trustedEventMocks.isTrustedMouseEvent,
  isTrustedPointerEvent: trustedEventMocks.isTrustedPointerEvent,
}));

import {
  createScenarioKeyboardCaptureHandler,
  createScenarioPointerDownHandler,
  createScenarioPointerUpHandler,
} from './helpers';
import type { ScenarioAutoClickRefs } from './types';

function createAutoClickRefs() {
  const buildCapturePayload = vi.fn(() => ({
    body: '',
    captureSurface: 'visible' as const,
    cursorPoint: { x: 24, y: 32 },
    interactionPoint: { x: 24, y: 32 },
    page: {
      devicePixelRatio: 1,
      scrollX: 0,
      scrollY: 0,
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
    },
    sourceKind: 'auto-click' as const,
    title: '',
  }));

  const refs: ScenarioAutoClickRefs = {
    blockedRef: { current: false },
    buildCapturePayloadRef: { current: buildCapturePayload },
    captureTransportRef: { current: vi.fn() },
    clickCapturePromiseRef: { current: null },
    pendingPointerCaptureRef: { current: null },
    pendingReplayClickRef: { current: null },
    refreshSessionRef: { current: vi.fn() },
    replayingClickRef: { current: false },
    sessionRef: {
      current: {
        captureMode: 'by-click',
        enabled: true,
        pendingProjectSelection: false,
        projectId: 'project-1',
        projectName: 'Project 1',
        rememberProjectSelection: true,
        sidebarVisible: true,
      },
    },
    setIsCompletelyHiddenRef: { current: vi.fn() },
  };

  return { buildCapturePayload, refs };
}

function createEnterEvent(target: HTMLElement) {
  const event = new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' });
  Object.defineProperty(event, 'target', { configurable: true, value: target });
  Object.defineProperty(event, 'composedPath', { configurable: true, value: () => [target] });
  return event;
}

function createPointerEvent(type: 'pointerdown' | 'pointerup', target: HTMLElement) {
  const event = new PointerEvent(type, {
    bubbles: true,
    button: 0,
    clientX: type === 'pointerdown' ? 20 : 120,
    clientY: 30,
  });
  Object.defineProperty(event, 'target', { configurable: true, value: target });
  Object.defineProperty(event, 'composedPath', { configurable: true, value: () => [target] });
  return event;
}

beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.clearAllMocks();
  trustedEventMocks.isTrustedKeyboardEvent.mockReturnValue(true);
  trustedEventMocks.isTrustedMouseEvent.mockReturnValue(true);
  trustedEventMocks.isTrustedPointerEvent.mockReturnValue(true);
});

it('ignores synthetic keyboard capture events', async () => {
  const { buildCapturePayload, refs } = createAutoClickRefs();
  const target = document.createElement('button');
  document.body.append(target);
  trustedEventMocks.isTrustedKeyboardEvent.mockReturnValue(false);

  createScenarioKeyboardCaptureHandler(refs)(createEnterEvent(target));
  await Promise.resolve();

  expect(buildCapturePayload).not.toHaveBeenCalled();
});

it('requires a fully trusted pointer sequence before capture', async () => {
  const { buildCapturePayload, refs } = createAutoClickRefs();
  const target = document.createElement('div');
  document.body.append(target);
  const pointerDown = createPointerEvent('pointerdown', target);
  const pointerUp = createPointerEvent('pointerup', target);

  trustedEventMocks.isTrustedPointerEvent.mockReturnValueOnce(false);
  createScenarioPointerDownHandler(refs)(pointerDown);
  createScenarioPointerUpHandler(refs)(pointerUp);
  expect(buildCapturePayload).not.toHaveBeenCalled();

  trustedEventMocks.isTrustedPointerEvent.mockReset();
  trustedEventMocks.isTrustedPointerEvent.mockReturnValue(true);
  createScenarioPointerDownHandler(refs)(pointerDown);
  trustedEventMocks.isTrustedPointerEvent.mockReturnValue(false);
  createScenarioPointerUpHandler(refs)(pointerUp);

  expect(buildCapturePayload).not.toHaveBeenCalled();
});
