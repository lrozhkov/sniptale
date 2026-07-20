// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';
import {
  createBlurSettingsFixture,
  createFocusSettingsFixture,
  createFrameDataFixture,
  createStepBadgeSettingsFixture,
} from '../react/test-support';

const queryAllContentUiElements = vi.hoisted(() => vi.fn());
const invalidateFrameCache = vi.hoisted(() => vi.fn());
const getStoreState = vi.hoisted(() => vi.fn());

vi.mock('../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/dom-host')>()),
  queryAllContentUiElements,
}));

vi.mock('../../highlighter', () => ({
  invalidateFrameCache,
}));

vi.mock('../state/frame-ui.store', () => ({
  useFrameUIStore: {
    getState: getStoreState,
  },
}));

import { createClearFramesHandler } from './clear';
import { createRemoveFrameHandler } from './remove';
import { createUpdateFrameEffectHandler } from './dom';

function createFrame(frameId: string, withStepBadge = false) {
  return createFrameDataFixture(frameId, {
    blurSettings: createBlurSettingsFixture(),
    focusSettings: createFocusSettingsFixture(),
    ...(withStepBadge ? { stepBadge: createStepBadgeSettingsFixture({ value: '1' }) } : {}),
    width: 100,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  getStoreState.mockReturnValue({
    activeFrameId: null,
    popoverFrameId: null,
    reset: vi.fn(),
    forceHideTooltip: vi.fn(),
  });
  queryAllContentUiElements.mockReturnValue([]);
});

function verifyRemoveFrameResetsUiAndRecalculatesBadges() {
  let currentFrames = [createFrame('frame-1', true), createFrame('frame-2')];
  const setFrames = vi.fn<React.Dispatch<React.SetStateAction<typeof currentFrames>>>((updater) => {
    currentFrames = typeof updater === 'function' ? updater(currentFrames) : updater;
  });
  const linkedElementsRef = {
    current: new Map<string, HTMLElement>([
      ['frame-1', document.createElement('div')],
      ['frame-2', document.createElement('div')],
    ]),
  };
  const forceHideTooltip = vi.fn();
  getStoreState.mockReturnValue({
    activeFrameId: 'frame-1',
    popoverFrameId: null,
    reset: vi.fn(),
    forceHideTooltip,
  });
  const recalculateRef = { current: vi.fn<(excludeFrameId?: string) => void>() };

  const removeFrame = createRemoveFrameHandler({
    framesRef: { current: currentFrames },
    linkedElementsRef,
    recalculateStepBadgesRef: recalculateRef,
    setFrames,
  });

  removeFrame('frame-2');
  removeFrame('frame-1');
  vi.runAllTimers();

  expect(forceHideTooltip).toHaveBeenCalledTimes(1);
  expect(currentFrames).toEqual([]);
  expect(linkedElementsRef.current.size).toBe(0);
  expect(recalculateRef.current).toHaveBeenCalledWith('frame-1');
  expect(invalidateFrameCache).toHaveBeenCalledTimes(2);
}

function createClearFramesRoots() {
  const rootOne: Root = {
    render: vi.fn<(children: ReactNode) => void>(),
    unmount: vi.fn<() => void>(),
  };
  const rootTwo: Root = {
    render: vi.fn<(children: ReactNode) => void>(),
    unmount: vi.fn(() => {
      throw new Error('already gone');
    }),
  };

  return { rootOne, rootTwo };
}

function createClearFramesRefs(rootOne: Root, rootTwo: Root) {
  const container = document.createElement('div');

  return {
    container,
    removeSpy: vi.spyOn(container, 'remove'),
    isClearingRef: { current: false },
    rootsRef: {
      current: new Map([
        ['one', rootOne],
        ['two', rootTwo],
      ]),
    },
    containerRef: { current: container },
    linkedElementsRef: { current: new Map([['frame-1', document.createElement('div')]]) },
  };
}

function createClearFramesScenario() {
  const reset = vi.fn();
  const overlayOne = document.createElement('div');
  const overlayTwo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const removeOverlayOne = vi.spyOn(overlayOne, 'remove');
  const removeOverlayTwo = vi.spyOn(overlayTwo, 'remove');
  const { rootOne, rootTwo } = createClearFramesRoots();
  const refs = createClearFramesRefs(rootOne, rootTwo);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  let currentFrames = [createFrame('frame-1')];
  const setFrames = vi.fn<React.Dispatch<React.SetStateAction<typeof currentFrames>>>((updater) => {
    currentFrames = typeof updater === 'function' ? updater(currentFrames) : updater;
  });

  getStoreState.mockReturnValue({
    activeFrameId: null,
    popoverFrameId: null,
    reset,
    forceHideTooltip: vi.fn(),
  });
  queryAllContentUiElements.mockReturnValueOnce([overlayOne]).mockReturnValueOnce([overlayTwo]);

  const trackedClearFrames = createClearFramesHandler({
    isClearingRef: refs.isClearingRef,
    rootsRef: refs.rootsRef,
    containerRef: refs.containerRef,
    linkedElementsRef: refs.linkedElementsRef,
    setFrames,
  });

  return {
    reset,
    removeSpy: refs.removeSpy,
    removeOverlayOne,
    removeOverlayTwo,
    rootOne,
    rootTwo,
    consoleError,
    currentFrames: () => currentFrames,
    isClearingRef: refs.isClearingRef,
    rootsRef: refs.rootsRef,
    containerRef: refs.containerRef,
    linkedElementsRef: refs.linkedElementsRef,
    trackedClearFrames,
  };
}

function verifyClearFramesUnmountsRootsAndOverlays() {
  const scenario = createClearFramesScenario();

  scenario.trackedClearFrames();
  expect(scenario.isClearingRef.current).toBe(true);
  vi.advanceTimersByTime(100);

  expect(scenario.reset).toHaveBeenCalledTimes(1);
  expect(scenario.rootOne.unmount).toHaveBeenCalledTimes(1);
  expect(scenario.rootTwo.unmount).toHaveBeenCalledTimes(1);
  expect(scenario.consoleError).toHaveBeenCalledWith(
    '[ContentFrameMutations]',
    'Error unmounting root',
    expect.any(Error)
  );
  expect(scenario.removeSpy).toHaveBeenCalledTimes(1);
  expect(scenario.removeOverlayOne).toHaveBeenCalledTimes(1);
  expect(scenario.removeOverlayTwo).toHaveBeenCalledTimes(1);
  expect(scenario.containerRef.current).toBeNull();
  expect(scenario.rootsRef.current.size).toBe(0);
  expect(scenario.linkedElementsRef.current.size).toBe(0);
  expect(scenario.currentFrames()).toEqual([]);
  expect(invalidateFrameCache).toHaveBeenCalledTimes(1);
  expect(scenario.isClearingRef.current).toBe(false);
}

function verifyUpdateFrameEffectPersistsTargetSettings() {
  let currentFrames = [createFrame('frame-1'), createFrame('frame-2')];
  const setFrames = vi.fn<React.Dispatch<React.SetStateAction<typeof currentFrames>>>((updater) => {
    currentFrames = typeof updater === 'function' ? updater(currentFrames) : updater;
  });
  const tempFrame = createFrame('temp');
  if (!tempFrame.blurSettings || !tempFrame.focusSettings) {
    throw new Error('expected fixture effect settings');
  }
  const sessionBlurSettingsRef = { current: tempFrame.blurSettings };
  const sessionFocusSettingsRef = { current: tempFrame.focusSettings };
  const globalEffectModeRef = { current: 'border' as const };
  const targetFrame = currentFrames[1];
  if (!targetFrame) {
    throw new Error('expected second frame');
  }
  currentFrames[1] = {
    ...targetFrame,
    blurSettings: {
      amount: 32,
      blurType: 'solid',
      showBorder: false,
    },
    focusSettings: {
      opacity: 0.8,
      showBorder: true,
    },
  };

  const updateFrameEffect = createUpdateFrameEffectHandler({
    globalEffectModeRef,
    sessionBlurSettingsRef,
    sessionFocusSettingsRef,
    setFrames,
  });

  updateFrameEffect('frame-2', 'focus');
  const updatedFrame = currentFrames[1];
  if (!updatedFrame) {
    throw new Error('expected updated frame');
  }

  expect(globalEffectModeRef.current).toBe('focus');
  expect(sessionBlurSettingsRef.current).toEqual(updatedFrame.blurSettings);
  expect(sessionFocusSettingsRef.current).toEqual(updatedFrame.focusSettings);
  expect(updatedFrame.effectMode).toBe('focus');
}

describe('frame mutation action dom cleanup', () => {
  it(
    'removes frames, clears linked elements, and recalculates step badges for numbered frames',
    verifyRemoveFrameResetsUiAndRecalculatesBadges
  );

  it(
    'clears the frame runtime by resetting UI state, unmounting roots, and removing overlays',
    verifyClearFramesUnmountsRootsAndOverlays
  );

  it(
    'persists target blur and focus settings when changing the active effect mode',
    verifyUpdateFrameEffectPersistsTargetSettings
  );
});
