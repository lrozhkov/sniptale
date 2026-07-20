// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import type { ScenarioAutoClickRefs } from './types';

const contentIntentMocks = vi.hoisted(() => ({
  createTrustedContentActionIntentSource: vi.fn(),
}));

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedPointerEvent: vi.fn(() => true),
}));

vi.mock('../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/privileged-action-intent')>()),
  createTrustedContentActionIntentSource: contentIntentMocks.createTrustedContentActionIntentSource,
}));

vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  isTrustedPointerEvent: trustedEventMocks.isTrustedPointerEvent,
}));

vi.mock('../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/locker')>()),
  setUIHidden: vi.fn(),
}));

import { createScenarioPointerDownHandler, createScenarioPointerUpHandler } from './helpers';

function createAutoClickRefs() {
  const captureTransport = vi.fn(async () => ({ success: true }));
  const refs: ScenarioAutoClickRefs = {
    blockedRef: { current: false },
    buildCapturePayloadRef: {
      current: vi.fn(() => ({
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
      })),
    },
    captureTransportRef: { current: captureTransport },
    clickCapturePromiseRef: { current: null },
    pendingPointerCaptureRef: { current: null },
    pendingReplayClickRef: { current: null },
    refreshSessionRef: { current: vi.fn(async () => undefined) },
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

  return { captureTransport, refs };
}

function createPointerEvent(type: 'pointerdown' | 'pointerup', target: HTMLElement) {
  const event = new PointerEvent(type, {
    bubbles: true,
    button: 0,
    clientX: type === 'pointerdown' ? 20 : 24,
    clientY: type === 'pointerdown' ? 30 : 32,
  });
  Object.defineProperty(event, 'target', { configurable: true, value: target });
  Object.defineProperty(event, 'composedPath', { configurable: true, value: () => [target] });
  return event;
}

beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.clearAllMocks();
  trustedEventMocks.isTrustedPointerEvent.mockReturnValue(true);
});

it('passes the trusted pointer event intent source into delayed auto-click capture', async () => {
  const { captureTransport, refs } = createAutoClickRefs();
  const contentIntentSource = { kind: 'trusted-content-event' as const };
  const target = document.createElement('a');
  target.href = 'https://example.com/next';
  document.body.appendChild(target);
  contentIntentMocks.createTrustedContentActionIntentSource.mockReturnValue(contentIntentSource);

  createScenarioPointerDownHandler(refs)(createPointerEvent('pointerdown', target));
  const pointerUp = createPointerEvent('pointerup', target);
  createScenarioPointerUpHandler(refs)(pointerUp);
  await refs.clickCapturePromiseRef.current;

  expect(contentIntentMocks.createTrustedContentActionIntentSource).toHaveBeenCalledWith(pointerUp);
  expect(captureTransport).toHaveBeenCalledWith(expect.any(Object), { contentIntentSource });
});
