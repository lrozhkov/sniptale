// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../../features/highlighter/contracts';
import { createFrameDataFixture, createStepBadgeSettingsFixture } from '../../test-support';
import {
  createReorderStepBadge,
  initializeMissingStepBadgeOrders,
  sortFramesForStepBadgeReorder,
} from './reorder';

function createFrame(id: string, x: number, y: number, enabled = true): FrameData {
  return createFrameDataFixture(id, {
    ...(enabled ? { stepBadge: createStepBadgeSettingsFixture() } : {}),
    x,
    y,
  });
}

describe('frame-manager-step-badge-reorder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sorts badge-enabled frames by explicit order first and position fallback second', () => {
    const frames = [
      createFrame('frame-1', 10, 40),
      createFrame('frame-2', 10, 20),
      createFrame('frame-3', 10, 10, false),
    ];
    const orderMap = new Map([['frame-1', 3]]);

    expect(sortFramesForStepBadgeReorder(frames, orderMap).map((frame) => frame.id)).toEqual([
      'frame-1',
      'frame-2',
    ]);
  });
});

describe('frame-manager-step-badge-reorder mutation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes missing badge order entries and swaps neighboring ids on reorder', async () => {
    const frames = [createFrame('frame-1', 10, 10), createFrame('frame-2', 10, 20)];
    const orderMap = new Map<string, number>();
    const recalculateStepBadges = vi.fn();
    const setFrames = vi.fn((updater) => updater(frames));

    initializeMissingStepBadgeOrders(frames, orderMap);
    expect(orderMap).toEqual(
      new Map([
        ['frame-1', 0],
        ['frame-2', 1],
      ])
    );

    orderMap.clear();
    const reorderStepBadge = createReorderStepBadge({
      recalculateStepBadgesRef: { current: recalculateStepBadges },
      setFrames,
      stepBadgeOrderRef: { current: orderMap },
    });

    reorderStepBadge('frame-1', 'down');
    await vi.runAllTimersAsync();

    expect(setFrames).toHaveBeenCalledTimes(1);
    expect(orderMap).toEqual(
      new Map([
        ['frame-1', 1],
        ['frame-2', 0],
      ])
    );
    expect(recalculateStepBadges).toHaveBeenCalledTimes(1);
  });
});
