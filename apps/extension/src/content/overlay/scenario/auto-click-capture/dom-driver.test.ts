// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addEventListenerToAllWindowsDynamicMock, resolveIframeEventTargetMock, setUIHiddenMock } =
  vi.hoisted(() => ({
    addEventListenerToAllWindowsDynamicMock: vi.fn(() => vi.fn()),
    resolveIframeEventTargetMock: vi.fn<
      (event: Event, iframe?: HTMLIFrameElement) => HTMLElement | null
    >(() => null),
    setUIHiddenMock: vi.fn(),
  }));

vi.mock('../../../platform/frame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/frame')>()),
  addEventListenerToAllWindowsDynamic: addEventListenerToAllWindowsDynamicMock,
  resolveIframeEventTarget: resolveIframeEventTargetMock,
}));

vi.mock('../../../selection/locker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../selection/locker')>()),
  setUIHidden: setUIHiddenMock,
}));

import {
  registerScenarioAutoClickListeners,
  replayScenarioPendingClick,
  resolveScenarioKeyboardTarget,
  setScenarioAutoClickUiHidden,
  waitForScenarioAutoClickCaptureWindow,
} from './dom-driver';
import type { ScenarioAutoClickRefs } from './types';

function createRefs(): ScenarioAutoClickRefs {
  return {
    blockedRef: { current: false },
    buildCapturePayloadRef: { current: vi.fn() },
    captureTransportRef: { current: vi.fn() },
    clickCapturePromiseRef: { current: null },
    pendingPointerCaptureRef: { current: null },
    pendingReplayClickRef: { current: null },
    refreshSessionRef: { current: vi.fn(async () => undefined) },
    replayingClickRef: { current: false },
    sessionRef: {
      current: {
        enabled: true,
        captureMode: 'by-click',
        pendingProjectSelection: false,
        projectId: 'project-1',
        projectName: 'Project 1',
        rememberProjectSelection: true,
        sidebarVisible: true,
      },
    },
    setIsCompletelyHiddenRef: { current: vi.fn() },
  };
}

function resetDomDriverMocks() {
  vi.clearAllMocks();
  vi.useRealTimers();
}

function expectListenerRegistrationAndCleanup() {
  const cleanupFns = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()] as const;
  addEventListenerToAllWindowsDynamicMock
    .mockReturnValueOnce(cleanupFns[0])
    .mockReturnValueOnce(cleanupFns[1])
    .mockReturnValueOnce(cleanupFns[2])
    .mockReturnValueOnce(cleanupFns[3])
    .mockReturnValueOnce(cleanupFns[4]);

  const cleanup = registerScenarioAutoClickListeners({
    clickReplayHandler: vi.fn(),
    keyboardCaptureHandler: vi.fn(),
    pointerDownHandler: vi.fn(),
    pointerMoveHandler: vi.fn(),
    pointerUpHandler: vi.fn(),
  });

  expect(addEventListenerToAllWindowsDynamicMock).toHaveBeenCalledTimes(5);

  cleanup();

  cleanupFns.forEach((cleanupFn) => {
    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });
}

function expectKeyboardTargetResolution() {
  const target = document.createElement('button');
  target.textContent = 'Submit';
  resolveIframeEventTargetMock.mockReturnValueOnce(target);

  expect(resolveScenarioKeyboardTarget(new KeyboardEvent('keyup'))).toBe(target);

  resolveIframeEventTargetMock.mockReturnValueOnce(null);
  const fallbackTarget = document.createElement('a');
  fallbackTarget.textContent = 'Open';
  document.body.appendChild(fallbackTarget);
  Object.defineProperty(document, 'activeElement', {
    configurable: true,
    get: () => fallbackTarget,
  });

  expect(resolveScenarioKeyboardTarget(new KeyboardEvent('keyup'))).toBe(fallbackTarget);
}

async function expectReplayAndHiddenUiDriverBehavior() {
  vi.useFakeTimers();
  const refs = createRefs();
  const target = document.createElement('button');
  target.textContent = 'Replay';
  document.body.appendChild(target);
  const clickSpy = vi.fn();
  target.addEventListener('click', clickSpy);

  const setIsCompletelyHidden = vi.fn();
  setScenarioAutoClickUiHidden(true, setIsCompletelyHidden);
  expect(setUIHiddenMock).toHaveBeenCalledWith(true);
  expect(setIsCompletelyHidden).toHaveBeenCalledWith(true);

  const waitPromise = waitForScenarioAutoClickCaptureWindow();
  await vi.advanceTimersByTimeAsync(170);
  await waitPromise;

  replayScenarioPendingClick(
    {
      clientPoint: { x: 20, y: 30 },
      modifiers: {
        altKey: false,
        button: 0,
        ctrlKey: false,
        detail: 1,
        metaKey: false,
        shiftKey: false,
      },
      target,
    },
    refs
  );

  expect(refs.replayingClickRef.current).toBe(true);
  expect(clickSpy).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(0);
  expect(refs.replayingClickRef.current).toBe(false);
}

async function expectReplayRunsAnchorDefaultNavigationWhenClickIsNotCanceled() {
  vi.useFakeTimers();
  const refs = createRefs();
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  const target = document.createElement('a');
  target.href = 'https://example.com/next';
  target.target = '_blank';
  document.body.appendChild(target);
  const clickSpy = vi.fn();
  target.addEventListener('click', clickSpy);

  replayScenarioPendingClick(
    {
      clientPoint: { x: 20, y: 30 },
      modifiers: {
        altKey: false,
        button: 0,
        ctrlKey: false,
        detail: 1,
        metaKey: false,
        shiftKey: false,
      },
      target,
    },
    refs
  );

  expect(clickSpy).toHaveBeenCalledTimes(1);
  expect(openSpy).toHaveBeenCalledWith('https://example.com/next', '_blank', 'noopener');

  await vi.advanceTimersByTimeAsync(0);
  openSpy.mockRestore();
}

async function expectReplaySkipsAnchorNavigationWhenClickIsCanceled() {
  vi.useFakeTimers();
  const refs = createRefs();
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  const target = document.createElement('a');
  target.href = 'https://example.com/canceled';
  target.target = '_blank';
  target.addEventListener('click', (event) => event.preventDefault());
  document.body.appendChild(target);

  replayScenarioPendingClick(
    {
      clientPoint: { x: 20, y: 30 },
      modifiers: {
        altKey: false,
        button: 0,
        ctrlKey: false,
        detail: 1,
        metaKey: false,
        shiftKey: false,
      },
      target,
    },
    refs
  );

  expect(openSpy).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(0);
  openSpy.mockRestore();
}

describe('useScenarioAutoClickCapture.dom-driver', () => {
  beforeEach(resetDomDriverMocks);

  it('registers and cleans up all pointer, keyboard, and replay listeners', () => {
    expectListenerRegistrationAndCleanup();
  });

  it('resolves keyboard targets from iframe events and activeElement fallback', () => {
    expectKeyboardTargetResolution();
  });

  it('drives hidden-ui state and replays pending clicks through the DOM driver seam', async () => {
    await expectReplayAndHiddenUiDriverBehavior();
  });

  it('runs anchor default navigation after replay when the click is not canceled', async () => {
    await expectReplayRunsAnchorDefaultNavigationWhenClickIsNotCanceled();
  });

  it('keeps canceled replay clicks from navigating anchors', async () => {
    await expectReplaySkipsAnchorNavigationWhenClickIsCanceled();
  });
});
