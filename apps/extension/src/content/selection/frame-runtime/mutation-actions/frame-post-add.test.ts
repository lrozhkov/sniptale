// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBlurSettingsFixture,
  createFocusSettingsFixture,
  createFrameDataFixture,
  createStepBadgeSettingsFixture,
} from '../react/test-support';
import { applyAddedFrameSideEffects } from './frame-post-add';

const invalidateFrameCache = vi.hoisted(() => vi.fn());
const loggerLog = vi.hoisted(() => vi.fn());

vi.mock('../../highlighter', () => ({
  invalidateFrameCache,
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    log: loggerLog,
  }),
}));

function createFrameData(withStepBadge = true) {
  return createFrameDataFixture('frame-1', {
    borderSettings: {
      id: 'preset-1',
      name: 'Orange',
      order: 0,
      width: 3,
      color: '#ff671d',
      style: 'solid',
      radius: 8,
      padding: {
        top: 4,
        right: 5,
        bottom: 6,
        left: 7,
      },
      shadow: 30,
      customCss: '',
      fillColor: '#00000000',
      inheritCustomCss: false,
    },
    blurSettings: createBlurSettingsFixture(),
    focusSettings: createFocusSettingsFixture({ opacity: 0.45 }),
    ...(withStepBadge ? { stepBadge: createStepBadgeSettingsFixture({ sizeLevel: 2 }) } : {}),
    width: 100,
    linkedElementSelector: '#frame-anchor',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

function expectPostAddSideEffectsScheduleBadgeRecalc() {
  const recalculateStepBadgesRef = { current: vi.fn<(excludeFrameId?: string) => void>() };

  applyAddedFrameSideEffects({
    frameData: createFrameData(),
    isAutoMode: true,
    recalculateStepBadgesRef,
  });
  vi.runAllTimers();

  expect(invalidateFrameCache).toHaveBeenCalledTimes(1);
  expect(recalculateStepBadgesRef.current).toHaveBeenCalledWith();
  expect(loggerLog).toHaveBeenCalledWith(
    'Frame added',
    'frame-1',
    'effectMode',
    'border',
    'borderPreset',
    'Orange',
    'blurSettings',
    expect.any(Object),
    'focusSettings',
    expect.any(Object)
  );
}

function expectPostAddSkipsBadgeRecalcWhenFrameHasNoBadge() {
  const recalculateStepBadgesRef = { current: vi.fn<(excludeFrameId?: string) => void>() };

  applyAddedFrameSideEffects({
    frameData: createFrameData(false),
    isAutoMode: true,
    recalculateStepBadgesRef,
  });
  vi.runAllTimers();

  expect(recalculateStepBadgesRef.current).not.toHaveBeenCalled();
  expect(invalidateFrameCache).toHaveBeenCalledTimes(1);
}

describe('frame-mutation-actions-frame-post-add', () => {
  it(
    'invalidates caches, logs, and schedules step badge recalculation after an accepted add',
    expectPostAddSideEffectsScheduleBadgeRecalc
  );
  it(
    'skips step badge scheduling when the added frame has no badge',
    expectPostAddSkipsBadgeRecalcWhenFrameHasNoBadge
  );
});
