// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../../../features/highlighter/contracts';
import { createFrameDataFixture } from '../../test-support';
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
  expect(sessionStepBadgeTemplateRef.current).toEqual(
    expect.objectContaining({
      enabled: true,
      type: 'letter',
      alphabet: 'latin',
    })
  );
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
