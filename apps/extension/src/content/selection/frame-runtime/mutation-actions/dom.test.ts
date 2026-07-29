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
import { createFrameHostLayoutService } from '../host-layout/service';

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
    hoveredFrameId: null,
    selectedFrameId: null,
    activePopover: null,
    reset: vi.fn(),
    dismissFrame: vi.fn(),
    dismissFrameUi: vi.fn(),
  });
  queryAllContentUiElements.mockReturnValue([]);
});

function verifyRemoveFrameResetsUiAndRecalculatesBadges() {
  let currentFrames = [createFrame('frame-1', true), createFrame('frame-2')];
  const setFrames = vi.fn<React.Dispatch<React.SetStateAction<typeof currentFrames>>>((updater) => {
    currentFrames = typeof updater === 'function' ? updater(currentFrames) : updater;
  });
  const hostLayoutService = createFrameHostLayoutService();
  hostLayoutService.link('frame-1', document.createElement('div'), '#frame-1');
  hostLayoutService.link('frame-2', document.createElement('div'), '#frame-2');
  const hostLayoutServiceRef = { current: hostLayoutService };
  const dismissFrame = vi.fn();
  getStoreState.mockReturnValue({
    hoveredFrameId: null,
    selectedFrameId: 'frame-1',
    activePopover: null,
    reset: vi.fn(),
    dismissFrame,
    dismissFrameUi: vi.fn(),
  });
  const recalculateRef = { current: vi.fn<(excludeFrameId?: string) => void>() };

  const removeFrame = createRemoveFrameHandler({
    framesRef: { current: currentFrames },
    hostLayoutServiceRef,
    recalculateStepBadgesRef: recalculateRef,
    setFrames,
  });

  removeFrame('frame-2');
  removeFrame('frame-1');
  vi.runAllTimers();

  expect(dismissFrame).toHaveBeenCalledWith('frame-1');
  expect(currentFrames).toEqual([]);
  expect(hostLayoutService.getNode('frame-1')).toBeNull();
  expect(hostLayoutService.getNode('frame-2')).toBeNull();
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

  const hostLayoutService = createFrameHostLayoutService();
  hostLayoutService.link('frame-1', document.createElement('div'), '#frame-1');
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
    hostLayoutServiceRef: { current: hostLayoutService },
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
    hoveredFrameId: null,
    selectedFrameId: null,
    activePopover: null,
    reset,
    dismissFrame: vi.fn(),
    dismissFrameUi: vi.fn(),
  });
  queryAllContentUiElements.mockReturnValueOnce([overlayOne]).mockReturnValueOnce([overlayTwo]);

  const trackedClearFrames = createClearFramesHandler({
    isClearingRef: refs.isClearingRef,
    rootsRef: refs.rootsRef,
    containerRef: refs.containerRef,
    framesRef: { current: currentFrames },
    hostLayoutServiceRef: refs.hostLayoutServiceRef,
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
    hostLayoutServiceRef: refs.hostLayoutServiceRef,
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
  expect(scenario.hostLayoutServiceRef.current.getNode('frame-1')).toBeNull();
  expect(scenario.currentFrames()).toEqual([]);
  expect(invalidateFrameCache).toHaveBeenCalledTimes(1);
  expect(scenario.isClearingRef.current).toBe(false);
}

describe('frame mutation DOM cleanup', () => {
  it(
    'removes frames, clears linked elements, and recalculates step badges for numbered frames',
    verifyRemoveFrameResetsUiAndRecalculatesBadges
  );

  it(
    'clears the frame runtime by resetting UI state, unmounting roots, and removing overlays',
    verifyClearFramesUnmountsRootsAndOverlays
  );
});
