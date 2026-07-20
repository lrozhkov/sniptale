// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { createClearFramesHandler } from './clear';

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

function createFrame(frameId: string): FrameData {
  return {
    id: frameId,
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    effectMode: 'border',
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
  const setFrames = vi.fn<React.Dispatch<React.SetStateAction<FrameData[]>>>((updater) => {
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

function expectClearFramesUnmountsRootsAndOverlays() {
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

describe('frame-mutation-actions-clear', () => {
  it(
    'clears the frame runtime by resetting UI state, unmounting roots, and removing overlays',
    expectClearFramesUnmountsRootsAndOverlays
  );
});
