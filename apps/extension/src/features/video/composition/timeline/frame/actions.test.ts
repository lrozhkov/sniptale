import { describe, expect, it } from 'vitest';

import { getVideoCompositionActionDuration, resolveVideoCompositionActions } from './actions';

function expectActionDuration(
  event: { duration: number; kind: string; preset: string },
  value: number
) {
  expect(getVideoCompositionActionDuration(event as never)).toBe(value);
}

function verifyExplicitAndPresetDurations() {
  expectActionDuration({ duration: 2, kind: 'CLICK', preset: 'CLICK_RIPPLE' }, 2);
  expectActionDuration({ duration: 0, kind: 'CLICK', preset: 'CLICK_RIPPLE' }, 0.7);
  expectActionDuration({ duration: 0, kind: 'CALLOUT', preset: 'SPOTLIGHT' }, 1.1);
}

function verifyCompatibilityDurations() {
  expectActionDuration({ duration: 0, kind: 'PAUSE', preset: 'DWELL_ZOOM' }, 1.3);
  expectActionDuration({ duration: 0, kind: 'SCROLL', preset: 'SCROLL_EMPHASIS' }, 0.9);
  expectActionDuration({ duration: 0, kind: 'CLICK', preset: 'NONE' }, 0.6);
  expectActionDuration({ duration: 0, kind: 'PAUSE', preset: 'NONE' }, 0.5);
}

function createActiveActionEvent() {
  return {
    data: {},
    duration: 0.4,
    id: 'active',
    kind: 'CLICK',
    label: 'Active',
    point: { x: 120, y: 160 },
    preset: 'CLICK_RIPPLE',
    time: 1,
  } as const;
}

function verifyActiveActionResolution() {
  const activeEvent = createActiveActionEvent();
  const legacyScrollEvent = {
    data: {},
    duration: 0,
    id: 'legacy-scroll',
    kind: 'SCROLL',
    label: 'Legacy scroll',
    point: null,
    preset: 'SCROLL_EMPHASIS',
    time: 1,
  } as const;
  const actions = resolveVideoCompositionActions(
    {
      actionEvents: [activeEvent, legacyScrollEvent],
    } as never,
    1.2
  );

  expect(actions).toHaveLength(1);
  expect(actions[0]).toMatchObject({
    duration: 0.4,
    event: activeEvent,
    start: 1,
  });
  expect(actions[0]?.progress).toBeCloseTo(0.5, 5);
}

function verifyInactiveActionFiltering() {
  const activeEvent = createActiveActionEvent();

  expect(resolveVideoCompositionActions({ actionEvents: [activeEvent] } as never, 0.5)).toEqual([]);
  expect(resolveVideoCompositionActions({ actionEvents: [activeEvent] } as never, 1.5)).toEqual([]);
}

function verifyHiddenActionLaneFiltering() {
  expect(
    resolveVideoCompositionActions(
      {
        actionEvents: [createActiveActionEvent()],
        utilityLanes: {
          actions: { visible: false, locked: false },
          camera: { visible: true, locked: false },
        },
      } as never,
      1.2
    )
  ).toEqual([]);
}

describe('video composition frame actions', () => {
  it('covers explicit and preset-driven action durations', verifyExplicitAndPresetDurations);
  it(
    'keeps compatibility durations for legacy and neutral action presets',
    verifyCompatibilityDurations
  );
  it(
    'keeps legacy scroll events inert and returns only active composition actions',
    verifyActiveActionResolution
  );
  it(
    'filters composition actions outside the active playback window',
    verifyInactiveActionFiltering
  );
  it('filters composition actions when the action lane is hidden', verifyHiddenActionLaneFiltering);
});
