import { expect, it } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioProject,
} from '../../features/scenario/project/public';
import { type ScenarioProject } from '../../features/scenario/contracts/types/project';
import { buildCaptureStepActionEvents, buildSuggestedActionEvents } from './actions';

function createEntry(
  step: ReturnType<typeof createScenarioCaptureStep>,
  start: number,
  end: number
) {
  return { end, start, step };
}

function createSuggestedEventProject(
  suggestedEvents: ScenarioProject['suggestedEvents']
): ScenarioProject {
  return {
    ...createScenarioProject('Suggested'),
    suggestedEvents,
  };
}

function createSuggestedEvent(
  id: string,
  kind: ScenarioProject['suggestedEvents'][number]['kind'],
  message: string,
  sourceStepId: string | null
): ScenarioProject['suggestedEvents'][number] {
  return {
    createdAt: message.length,
    data: {},
    id,
    kind,
    message,
    sourceStepId,
    status: 'pending',
    target: null,
  };
}

function expectSuggestedEventShape(
  id: string,
  kind: string,
  preset: string,
  time: number,
  point: { x: number; y: number } | null
) {
  return expect.objectContaining({ id, kind, point, preset, time });
}

it('creates click accents only for capture steps with a resolved interaction point', () => {
  const interactiveStep = {
    ...createScenarioCaptureStep({
      assetId: 'asset-1',
      overlays: [{ id: 'ring-1', kind: 'click-ring', point: { x: 30, y: 40 } }],
      title: 'Capture',
    }),
    id: 'capture-1',
  };
  const passiveStep = {
    ...createScenarioCaptureStep({ assetId: 'asset-2', title: 'Passive capture' }),
    id: 'capture-2',
  };

  expect(
    buildCaptureStepActionEvents([
      createEntry(interactiveStep, 0, 4),
      createEntry(passiveStep, 4, 8),
    ])
  ).toEqual([
    expect.objectContaining({
      id: 'capture-1:click',
      point: { x: 30, y: 40 },
      preset: 'CLICK_RIPPLE',
      time: 0.35,
    }),
  ]);
});

it('drops suggested scroll events and keeps keydown accents on the current capture step', () => {
  const step = {
    ...createScenarioCaptureStep({
      assetId: 'asset-1',
      interactionPoint: { x: 80, y: 120 },
      title: 'Capture',
    }),
    id: 'capture-1',
  };

  expect(
    buildSuggestedActionEvents(
      createSuggestedEventProject([
        createSuggestedEvent('event-scroll', 'scroll', 'Scroll', 'capture-1'),
        createSuggestedEvent('event-key', 'keydown', 'Press key', 'capture-1'),
      ]),
      [createEntry(step, 2, 6)]
    )
  ).toEqual([
    expectSuggestedEventShape('event-key', 'CALLOUT', 'SPOTLIGHT', 2.45, { x: 80, y: 120 }),
  ]);
});

it('falls back to default timeline offsets for detached suggested events', () => {
  expect(
    buildSuggestedActionEvents(
      createSuggestedEventProject([
        createSuggestedEvent('event-input', 'input', 'Type value', null),
        createSuggestedEvent('event-change', 'change', 'Change value', 'missing-step'),
        createSuggestedEvent('event-click', 'click', 'Click CTA', null),
      ]),
      []
    )
  ).toEqual([
    expectSuggestedEventShape('event-input', 'PAUSE', 'DWELL_ZOOM', 0.45, null),
    expectSuggestedEventShape('event-change', 'PAUSE', 'DWELL_ZOOM', 5.45, null),
    expectSuggestedEventShape('event-click', 'CLICK', 'CLICK_RIPPLE', 10.45, null),
  ]);
});

it('uses the provided fallback step duration for detached suggested events', () => {
  expect(
    buildSuggestedActionEvents(
      createSuggestedEventProject([
        createSuggestedEvent('event-input', 'input', 'Type value', null),
        createSuggestedEvent('event-click', 'click', 'Click CTA', null),
      ]),
      [],
      4
    )
  ).toEqual([
    expectSuggestedEventShape('event-input', 'PAUSE', 'DWELL_ZOOM', 0.45, null),
    expectSuggestedEventShape('event-click', 'CLICK', 'CLICK_RIPPLE', 4.45, null),
  ]);
});
