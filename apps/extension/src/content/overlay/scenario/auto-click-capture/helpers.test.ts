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

import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import {
  createScenarioClickReplayHandler,
  createScenarioPointerDownHandler,
  createScenarioPointerMoveHandler,
  createScenarioPointerUpHandler,
  createScenarioKeyboardCaptureHandler,
} from './helpers';
import { canCaptureScenarioInteraction } from './shared';
import type { ScenarioAutoClickRefs } from './types';

function createSessionState(
  overrides: Partial<ScenarioAutoClickRefs['sessionRef']['current']> = {}
) {
  return {
    enabled: true,
    captureMode: 'by-click' as const,
    pendingProjectSelection: false,
    projectId: 'project-1',
    projectName: 'Project 1',
    rememberProjectSelection: true,
    sidebarVisible: true,
    ...overrides,
  };
}

function createAutoClickRefs() {
  const refreshSession = vi.fn(async () => undefined);
  const buildCapturePayload = vi.fn(() => ({
    body: '',
    captureSurface: 'visible' as const,
    cursorPoint: { x: 24, y: 32 },
    interactionPoint: { x: 24, y: 32 },
    page: {
      title: 'Page',
      url: 'https://example.com',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      scrollX: 0,
      scrollY: 0,
      devicePixelRatio: 1,
    },
    sourceKind: 'auto-click' as const,
    title: '',
  }));
  const refs: ScenarioAutoClickRefs = {
    blockedRef: { current: false },
    buildCapturePayloadRef: { current: buildCapturePayload },
    captureTransportRef: {
      current: (payload) =>
        sendRuntimeMessageMock({
          type: CaptureMessageType.CAPTURE_VISIBLE,
          actionType: 'scenario',
          scenarioCapture: payload,
        }),
    },
    clickCapturePromiseRef: { current: null },
    pendingPointerCaptureRef: { current: null },
    pendingReplayClickRef: { current: null },
    refreshSessionRef: { current: refreshSession },
    replayingClickRef: { current: false },
    sessionRef: { current: createSessionState() },
    setIsCompletelyHiddenRef: { current: vi.fn() },
  };

  return { buildCapturePayload, refreshSession, refs };
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

function createPointerLikeEvent(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  target: HTMLElement,
  init: MouseEventInit
) {
  const event = new PointerEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, 'target', { configurable: true, value: target });
  Object.defineProperty(event, 'composedPath', {
    configurable: true,
    value: () => [target],
  });
  return event;
}

beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.clearAllMocks();
  trustedEventMocks.isTrustedKeyboardEvent.mockReturnValue(true);
  trustedEventMocks.isTrustedMouseEvent.mockReturnValue(true);
  trustedEventMocks.isTrustedPointerEvent.mockReturnValue(true);
  sendRuntimeMessageMock.mockResolvedValue({ success: true });
});

it('captures by Enter in by-click mode and refreshes the recorder session', async () => {
  const { buildCapturePayload, refreshSession, refs } = createAutoClickRefs();
  const target = document.createElement('button');
  target.textContent = 'Submit';
  document.body.appendChild(target);

  const handler = createScenarioKeyboardCaptureHandler(refs);
  handler(createEnterEvent(target));
  await refs.clickCapturePromiseRef.current;

  expect(buildCapturePayload).toHaveBeenCalledWith(
    'visible',
    'auto-click',
    target,
    expect.any(Object),
    expect.any(Object),
    expect.objectContaining({
      trigger: 'keyboard-enter',
    })
  );
  expect(setUIHiddenMock).toHaveBeenCalledWith(true);
  expect(setUIHiddenMock).toHaveBeenLastCalledWith(false);
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: CaptureMessageType.CAPTURE_VISIBLE,
    actionType: 'scenario',
    scenarioCapture: expect.objectContaining({
      captureSurface: 'visible',
      sourceKind: 'auto-click',
    }),
  });
  expect(refreshSession).toHaveBeenCalledTimes(1);
});

it('blocks keyboard capture when the recorder is blocked or not in by-click mode', async () => {
  const { buildCapturePayload, refs } = createAutoClickRefs();
  const target = document.createElement('button');
  document.body.appendChild(target);

  refs.blockedRef.current = true;
  expect(canCaptureScenarioInteraction(refs, 'keyboard')).toBe(false);
  createScenarioKeyboardCaptureHandler(refs)(createEnterEvent(target));

  refs.blockedRef.current = false;
  refs.sessionRef.current = createSessionState({ captureMode: 'manual' });
  expect(canCaptureScenarioInteraction(refs, 'pointer')).toBe(false);
  createScenarioKeyboardCaptureHandler(refs)(createEnterEvent(target));

  await Promise.resolve();

  expect(buildCapturePayload).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
});

it('captures on pointer-up even after text selection drag and records pointer metadata', async () => {
  const { buildCapturePayload, refreshSession, refs } = createAutoClickRefs();
  const target = document.createElement('div');
  target.textContent = 'Selectable text';
  document.body.appendChild(target);

  createScenarioPointerDownHandler(refs)(
    createPointerLikeEvent('pointerdown', target, {
      button: 0,
      clientX: 20,
      clientY: 30,
    })
  );
  createScenarioPointerMoveHandler(refs)(
    createPointerLikeEvent('pointermove', target, { clientX: 90, clientY: 30 })
  );
  createScenarioPointerUpHandler(refs)(
    createPointerLikeEvent('pointerup', target, { clientX: 120, clientY: 30 })
  );
  await refs.clickCapturePromiseRef.current;

  expect(buildCapturePayload).toHaveBeenCalledWith(
    'visible',
    'auto-click',
    target,
    { x: 120, y: 30 },
    { x: 120, y: 30 },
    expect.objectContaining({
      pointerRange: expect.objectContaining({
        start: { x: 20, y: 30 },
        end: { x: 120, y: 30 },
      }),
      trigger: 'pointer-up',
    })
  );
  expect(refreshSession).toHaveBeenCalledTimes(1);
});

it('replays the pending click only after a successful capture', async () => {
  const { refs } = createAutoClickRefs();
  const target = document.createElement('button');
  const replayListener = vi.fn();
  target.addEventListener('click', replayListener);
  document.body.appendChild(target);

  refs.pendingReplayClickRef.current = {
    clientPoint: { x: 12, y: 18 },
    modifiers: {
      altKey: false,
      button: 0,
      ctrlKey: false,
      detail: 1,
      metaKey: false,
      shiftKey: false,
    },
    target,
  };
  refs.clickCapturePromiseRef.current = Promise.resolve(true);

  const event = new MouseEvent('click');
  const preventDefault = vi.spyOn(event, 'preventDefault');
  const stopImmediatePropagation = vi.spyOn(event, 'stopImmediatePropagation');
  const stopPropagation = vi.spyOn(event, 'stopPropagation');

  createScenarioClickReplayHandler(refs)(event);
  await refs.clickCapturePromiseRef.current;
  await Promise.resolve();

  expect(preventDefault).toHaveBeenCalled();
  expect(stopImmediatePropagation).toHaveBeenCalled();
  expect(stopPropagation).toHaveBeenCalled();
  expect(replayListener).toHaveBeenCalledTimes(1);
  expect(refs.pendingReplayClickRef.current).toBeNull();
});

it('does not replay the pending click after a failed capture', async () => {
  const { refs } = createAutoClickRefs();
  const target = document.createElement('button');
  const replayListener = vi.fn();
  target.addEventListener('click', replayListener);
  document.body.appendChild(target);

  refs.pendingReplayClickRef.current = {
    clientPoint: { x: 12, y: 18 },
    modifiers: {
      altKey: false,
      button: 0,
      ctrlKey: false,
      detail: 1,
      metaKey: false,
      shiftKey: false,
    },
    target,
  };
  refs.clickCapturePromiseRef.current = Promise.resolve(false);

  const event = new MouseEvent('click');

  createScenarioClickReplayHandler(refs)(event);
  await refs.clickCapturePromiseRef.current;
  await Promise.resolve();

  expect(replayListener).not.toHaveBeenCalled();
  expect(refs.pendingReplayClickRef.current).toBeNull();
});
