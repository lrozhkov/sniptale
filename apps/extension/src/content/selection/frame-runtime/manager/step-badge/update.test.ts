// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../../features/highlighter/contracts';
import { createFrameDataFixture, createStepBadgeSettingsFixture } from '../../test-support';
import {
  createUpdateFrameStepBadge,
  createUpdateGlobalStepBadgeSettings,
  shouldRecalculateBadge,
} from './update';

function createFrame(id: string): FrameData {
  return createFrameDataFixture(id);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it(
  'updates frame step-badge settings and schedules recalculation for auto-mode transitions',
  expectFrameStepBadgeUpdate
);

it(
  'updates global auto-mode settings and recalculates only on false -> true transition',
  expectGlobalStepBadgeSettingsUpdate
);

it('keeps manual boundary placement local to the selected frame', () => {
  let frames = [
    createFrameDataFixture('frame-1', {
      stepBadge: createStepBadgeSettingsFixture({ value: '1' }),
    }),
  ];
  const sessionStepBadgeTemplateRef = {
    current: null as ReturnType<typeof createStepBadgeSettingsFixture> | null,
  };
  const updateFrameStepBadge = createUpdateFrameStepBadge({
    globalStepBadgeSettingsRef: { current: { autoMode: true } },
    recalculateStepBadgesRef: { current: vi.fn() },
    sessionStepBadgeTemplateRef,
    setFrames: (update) => {
      frames = typeof update === 'function' ? update(frames) : update;
    },
  });

  updateFrameStepBadge('frame-1', {
    manualPlacement: { position: 0.7, side: 'bottom' },
  });

  expect(frames[0]?.stepBadge?.manualPlacement).toEqual({ position: 0.7, side: 'bottom' });
  expect(sessionStepBadgeTemplateRef.current).toBeNull();
});

it('clears a manual boundary placement when a preset replacement requests it', () => {
  let frames = [
    createFrameDataFixture('frame-1', {
      stepBadge: createStepBadgeSettingsFixture({
        manualPlacement: { position: 0.7, side: 'bottom' },
      }),
    }),
  ];
  const updateFrameStepBadge = createUpdateFrameStepBadge({
    globalStepBadgeSettingsRef: { current: { autoMode: true } },
    recalculateStepBadgesRef: { current: vi.fn() },
    setFrames: (update) => {
      frames = typeof update === 'function' ? update(frames) : update;
    },
  });

  updateFrameStepBadge('frame-1', { manualPlacement: undefined, sourcePresetId: 'system-classic' });

  expect(frames[0]?.stepBadge?.manualPlacement).toBeUndefined();
  expect(frames[0]?.stepBadge?.sourcePresetId).toBe('system-classic');
});

it(
  'detects the step-badge transitions that require auto recalculation',
  expectStepBadgeRecalculationDetection
);

async function expectFrameStepBadgeUpdate() {
  const recalculateStepBadges = vi.fn();
  const setFrames = vi.fn((updater) => updater([createFrame('frame-1')]));
  const sessionStepBadgeTemplateRef = { current: null };
  const updateFrameStepBadge = createUpdateFrameStepBadge({
    globalStepBadgeSettingsRef: { current: { autoMode: true } },
    recalculateStepBadgesRef: { current: recalculateStepBadges },
    sessionStepBadgeTemplateRef,
    setFrames,
  });

  updateFrameStepBadge('frame-1', {
    enabled: true,
    type: 'letter',
    alphabet: 'latin',
  });
  await vi.runAllTimersAsync();

  expect(setFrames).toHaveBeenCalledTimes(1);
  expect(sessionStepBadgeTemplateRef.current).toBeNull();
  expect(recalculateStepBadges).toHaveBeenCalledTimes(1);
}

function expectGlobalStepBadgeSettingsUpdate() {
  const recalculateStepBadges = vi.fn();
  const globalStepBadgeSettingsRef = { current: { autoMode: false } };
  const updateGlobalStepBadgeSettings = createUpdateGlobalStepBadgeSettings({
    globalStepBadgeSettingsRef,
    recalculateStepBadges,
  });

  updateGlobalStepBadgeSettings({ autoMode: true });
  updateGlobalStepBadgeSettings({ autoMode: true });

  expect(globalStepBadgeSettingsRef.current).toEqual({ autoMode: true });
  expect(recalculateStepBadges).toHaveBeenCalledTimes(1);
}

function expectStepBadgeRecalculationDetection() {
  const disabledSettings = {
    enabled: false,
    anchor: 'top-left' as const,
    offsetDirections: [],
    type: 'number' as const,
    alphabet: 'cyrillic' as const,
    value: '',
    sizeLevel: 3 as const,
  };
  const manualSettings = {
    ...disabledSettings,
    auto: false as const,
    enabled: true,
    type: 'letter' as const,
  };

  expect(shouldRecalculateBadge(disabledSettings, manualSettings, true)).toBe(true);
  expect(shouldRecalculateBadge(manualSettings, { ...manualSettings, auto: true }, false)).toBe(
    true
  );
  expect(
    shouldRecalculateBadge(manualSettings, { ...manualSettings, value: 'custom' }, false)
  ).toBe(false);
}
