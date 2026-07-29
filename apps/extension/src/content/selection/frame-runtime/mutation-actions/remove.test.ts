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
import { createFrameHostLayoutService } from '../host-layout/service';

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
    hoveredFrameId: null,
    selectedFrameId: null,
    activePopover: null,
    reset: vi.fn(),
    dismissFrame: vi.fn(),
    dismissFrameUi: vi.fn(),
  });
});

function expectRemoveFrameResetsUiAndRecalculatesBadges() {
  let currentFrames = [createFrame('frame-1', true), createFrame('frame-2')];
  const setFrames = vi.fn<React.Dispatch<React.SetStateAction<FrameData[]>>>((updater) => {
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

  expect(dismissFrame).toHaveBeenNthCalledWith(1, 'frame-2');
  expect(dismissFrame).toHaveBeenNthCalledWith(2, 'frame-1');
  expect(currentFrames).toEqual([]);
  expect(hostLayoutService.getNode('frame-1')).toBeNull();
  expect(hostLayoutService.getNode('frame-2')).toBeNull();
  expect(recalculateRef.current).toHaveBeenCalledWith('frame-1');
  expect(invalidateFrameCache).toHaveBeenCalledTimes(2);
}

describe('frame-mutation-actions-remove', () => {
  it(
    'removes frames, clears linked elements, and recalculates step badges for numbered frames',
    expectRemoveFrameResetsUiAndRecalculatesBadges
  );

  it('retains anchor identity for delete undo and rejects a recycled selector match', () => {
    const original = document.createElement('a');
    original.id = 'target';
    original.href = '/original';
    document.body.appendChild(original);
    const frame = createFrame('frame-1');
    frame.linkedElementSelector = '#target';
    const framesRef = { current: [frame] };
    const service = createFrameHostLayoutService();
    service.link(frame.id, original, frame.linkedElementSelector);
    const removeFrame = createRemoveFrameHandler({
      framesRef,
      hostLayoutServiceRef: { current: service },
      recalculateStepBadgesRef: { current: vi.fn() },
      setFrames: (frames) => {
        framesRef.current = typeof frames === 'function' ? frames(framesRef.current) : frames;
      },
    });

    removeFrame(frame.id);
    original.remove();
    const recycled = document.createElement('a');
    recycled.id = 'target';
    recycled.href = '/different';
    document.body.appendChild(recycled);
    framesRef.current = [frame];
    service.restoreFrames(framesRef.current);

    expect(service.getNode(frame.id)).toBeNull();
    expect(service.getSnapshot().presentations.get(frame.id)).toBe('missing');
  });
});
