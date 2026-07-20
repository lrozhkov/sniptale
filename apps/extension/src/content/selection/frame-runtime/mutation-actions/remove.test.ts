// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  createBlurSettingsFixture,
  createFocusSettingsFixture,
  createFrameDataFixture,
  createStepBadgeSettingsFixture,
} from '../react/test-support';
import { createRemoveFrameHandler } from './remove';

const invalidateFrameCache = vi.hoisted(() => vi.fn());
const getStoreState = vi.hoisted(() => vi.fn());

vi.mock('../../highlighter', () => ({
  invalidateFrameCache,
}));

vi.mock('../state/frame-ui.store', () => ({
  useFrameUIStore: {
    getState: getStoreState,
  },
}));

function createFrame(frameId: string, withStepBadge = false): FrameData {
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
});

function expectRemoveFrameResetsUiAndRecalculatesBadges() {
  let currentFrames = [createFrame('frame-1', true), createFrame('frame-2')];
  const setFrames = vi.fn<React.Dispatch<React.SetStateAction<FrameData[]>>>((updater) => {
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

describe('frame-mutation-actions-remove', () => {
  it(
    'removes frames, clears linked elements, and recalculates step badges for numbered frames',
    expectRemoveFrameResetsUiAndRecalculatesBadges
  );
});
