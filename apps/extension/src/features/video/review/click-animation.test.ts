import { expect, it } from 'vitest';
import {
  REVIEW_CLICK_DEFAULT,
  patchReviewClicks,
  parseReviewClickAnimations,
} from './advanced/click-animation';
import { scheduleReviewClicks, evaluateReviewClicks } from './click-animation';
import { buildReviewTimeMap } from './timeline';
import { projectReviewTelemetry, type ReviewTelemetryMarker } from './telemetry';
import { createQuickEditAdvancedState, createQuickEditAdvancedContent } from './advanced/defaults';
import { loadQuickEditAdvancedContentState } from './advanced/validation';
import { replayReviewHistory, reviewAdvancedContentBaseline } from './document';
import { resolveQuickEditExportPlan } from './advanced/effective';

const marker: ReviewTelemetryMarker = {
  ref: { kind: 'action', id: 'click' },
  eventType: 'CLICK',
  start: 2.9,
  end: 2.9,
  focusPoint: { x: 0.2, y: 0.4 },
};
const animations = patchReviewClicks([], ['click'], {
  effect: 'ripple',
  before: 0.1,
  after: 1,
  offset: -0.05,
  x: 0.1,
});

it('strictly validates persisted styles, preserves legacy absence and canonical fixed points', () => {
  expect(parseReviewClickAnimations(undefined)).toBeUndefined();
  expect(parseReviewClickAnimations(animations)).toEqual(animations);
  for (const patch of [
    { after: NaN },
    { opacity: 2 },
    { offset: Infinity },
    { pulses: 1.5 },
    { radius: -1 },
    { effect: 'unknown' },
    { color: 'url(bad)' },
  ])
    expect(parseReviewClickAnimations([{ ...animations[0], ...patch }])).toBeNull();
  expect(parseReviewClickAnimations([animations[0], animations[0]])).toBeNull();
  const content = { ...createQuickEditAdvancedContent(), clickAnimations: animations };
  const loaded = loadQuickEditAdvancedContentState(JSON.parse(JSON.stringify(content)));
  expect(loaded).toEqual(content);
  expect(loadQuickEditAdvancedContentState(loaded)).toEqual(content);
  expect(loadQuickEditAdvancedContentState({ ...content, clickAnimations: [{}] })).toBeNull();
});

it('bulk changes preserve individual styles and reset only explicit identities', () => {
  const first = patchReviewClicks([], ['a'], { effect: 'glow', color: '#123456', radius: 80 });
  const both = patchReviewClicks(first, ['a', 'b'], { offset: -0.05 });
  expect(both[0]).toMatchObject({ effect: 'glow', color: '#123456ff', radius: 80, offset: -0.05 });
  expect(both[1]).toMatchObject({ ...REVIEW_CLICK_DEFAULT, id: 'b', offset: -0.05 });
  expect(first[0]!.offset).toBe(0);
  expect(patchReviewClicks(both, ['a'], null)).toEqual([both[1]]);
});

it('keeps result-time phases across speed boundaries and clamps only at cuts', () => {
  const segments = buildReviewTimeMap(8, [
    {
      id: 's',
      kind: 'speed',
      start: 3,
      end: 5,
      requestedStart: 3,
      requestedEnd: 5,
      rate: 2,
      audio: 'speed',
    },
    { id: 'c', kind: 'cut', start: 5, end: 6, requestedStart: 5, requestedEnd: 6 },
  ]);
  const original = structuredClone(marker);
  const cues = scheduleReviewClicks([marker], animations, segments);
  expect(cues[0]).toMatchObject({ anchor: 2.85, start: 2.75, end: 3.85, point: { y: 0.4 } });
  expect(cues[0]!.point.x).toBeCloseTo(0.3);
  expect(evaluateReviewClicks(cues, 3.5)).toHaveLength(1);
  const long = scheduleReviewClicks(
    [marker],
    patchReviewClicks(animations, ['click'], { after: 5 }),
    segments
  );
  expect(long[0]!.end).toBe(4);
  expect(evaluateReviewClicks(long, 4)).toEqual([]);
  expect(scheduleReviewClicks([{ ...marker, start: 5.5 }], animations, segments)).toEqual([]);
  expect(
    scheduleReviewClicks(
      [{ ref: marker.ref, eventType: marker.eventType, start: marker.start, end: marker.end }],
      animations,
      segments
    )
  ).toEqual([]);
  expect(marker).toEqual(original);
});

it('out-of-run offsets do not leak across cut boundaries and repeated pulses have stable phase', () => {
  const map = buildReviewTimeMap(8, [
    { id: 'c', kind: 'cut', start: 3, end: 6, requestedStart: 3, requestedEnd: 6 },
  ]);
  expect(
    scheduleReviewClicks(
      [marker],
      patchReviewClicks(animations, ['click'], { offset: 2, before: 0 }),
      map
    )
  ).toEqual([]);
  const cues = scheduleReviewClicks(
    [marker],
    patchReviewClicks(animations, ['click'], { offset: 0, before: 0, after: 1, pulses: 2 }),
    buildReviewTimeMap(8, [])
  );
  expect(evaluateReviewClicks(cues, 3.05)[0]!.opacity).toBeCloseTo(
    evaluateReviewClicks(cues, 3.55)[0]!.opacity
  );
  expect(evaluateReviewClicks(cues, 2)).toEqual([]);
  expect(evaluateReviewClicks(cues, 4)).toEqual([]);
});

it('semantic double click produces one identity/effect without changing captured telemetry', () => {
  const input = {
    cursorTrack: null,
    signals: [],
    actionEvents: [1, 2].map((count) => ({
      id: `click-${count}`,
      kind: 'CLICK' as const,
      time: 1 + count * 0.1,
      duration: 0,
      point: { x: 30, y: 40 },
      recordingPoint: { x: 0.3, y: 0.4 },
      label: '',
      data: { targetId: 'button', clickCount: count },
      preset: 'NONE' as const,
    })),
  };
  const copy = structuredClone(input);
  const projected = projectReviewTelemetry(input, 8);
  expect(projected.markers).toHaveLength(1);
  expect(projected.markers[0]!.eventType).toBe('DOUBLE_CLICK');
  expect(
    scheduleReviewClicks(
      projected.markers,
      patchReviewClicks([], ['click-1'], { effect: 'ripple' }),
      buildReviewTimeMap(8, [])
    )
  ).toHaveLength(1);
  expect(input).toEqual(copy);
});

it('undo/redo and baseline restore click settings; hidden lane suppresses export without losing settings', () => {
  const before = createQuickEditAdvancedContent();
  const after = { ...before, clickAnimations: animations };
  const history = [{ id: 'op', at: 1, target: 'advancedContent' as const, before, after }];
  const source = { duration: 8, width: 640, height: 360, mimeType: 'video/mp4', size: 1 };
  expect(replayReviewHistory(history, 0, source).advancedContent).toEqual(before);
  expect(replayReviewHistory(history, 1, source).advancedContent).toEqual(after);
  const state = { ...createQuickEditAdvancedState(), ...after };
  expect(reviewAdvancedContentBaseline(state)).toEqual(after);
  const document = { edits: [], canvasComments: [] };
  expect(resolveQuickEditExportPlan({ advanced: state, document })).toMatchObject({
    video: 'copy',
  });
  state.ui.mode = 'advanced';
  state.ui.tracks.actions = false;
  expect(resolveQuickEditExportPlan({ advanced: state, document })).toMatchObject({
    video: 'copy',
  });
  state.ui.tracks.actions = true;
  expect(resolveQuickEditExportPlan({ advanced: state, document })).toMatchObject({
    video: 'render',
    reasons: ['click-animations'],
  });
});

it.each(['ripple', 'press', 'glow'] as const)(
  'applies before, after and offset independently for %s in result time',
  (effect) => {
    const map = buildReviewTimeMap(10, [
      {
        id: 'speed',
        kind: 'speed',
        start: 0,
        end: 10,
        requestedStart: 0,
        requestedEnd: 10,
        rate: 2,
        audio: 'speed',
      },
    ]);
    const point = { ...marker, start: 4, end: 4 };
    const settings = patchReviewClicks([], ['click'], {
      effect,
      before: 0.4,
      after: 0.8,
      offset: 0.2,
      x: 0.005,
      y: -0.008,
      color: '#00ff0080',
    });
    const cues = scheduleReviewClicks([point], settings, map);
    expect(cues[0]!.anchor).toBeCloseTo(2.2);
    expect(cues[0]!.start).toBeCloseTo(1.8);
    expect(cues[0]!.end).toBeCloseTo(3);
    expect(evaluateReviewClicks(cues, 1.79)).toEqual([]);
    expect(evaluateReviewClicks(cues, 3.01)).toEqual([]);
    const before = evaluateReviewClicks(cues, 2)[0]!;
    const after = evaluateReviewClicks(cues, 2.6)[0]!;
    expect(before).toMatchObject({
      effect,
      color: '#00ff0080',
      point: { x: 0.20500000000000002, y: 0.392 },
    });
    expect(before.opacity).toBeCloseTo(0.5);
    expect(after.opacity).toBeCloseTo(0.5);
    const earlier = scheduleReviewClicks(
      [point],
      patchReviewClicks(settings, ['click'], { offset: -0.2 }),
      map
    );
    expect(evaluateReviewClicks(earlier, 1.6)[0]!.radius).toBeCloseTo(before.radius);
    expect(evaluateReviewClicks(earlier, 2.2)[0]!.radius).toBeCloseTo(after.radius);
  }
);

it('roundtrips optional lens parameters without rewriting legacy click styles', () => {
  expect(parseReviewClickAnimations(animations)).toEqual(animations);
  expect(parseReviewClickAnimations(animations)![0]).not.toHaveProperty('magnification');
  const lens = patchReviewClicks([], ['click'], {
    effect: 'magnify',
    magnification: 2,
    lensShape: 'rounded',
    lensShadow: 30,
  });
  expect(parseReviewClickAnimations(lens)).toEqual(lens);
  for (const patch of [
    { magnification: NaN },
    { magnification: 0.5 },
    { magnification: 4 },
    { lensShadow: -1 },
    { lensShadow: 101 },
    { lensShape: 'triangle' },
  ])
    expect(parseReviewClickAnimations([{ ...lens[0], ...patch }])).toBeNull();
  const content = { ...createQuickEditAdvancedContent(), clickAnimations: lens };
  expect(loadQuickEditAdvancedContentState(JSON.parse(JSON.stringify(content)))).toEqual(content);
});

it('magnifies once around the click, returns to identity, and ignores decorative pulse count', () => {
  const settings = {
    ...REVIEW_CLICK_DEFAULT,
    effect: 'magnify' as const,
    magnification: 2,
    radius: 80,
    before: 1,
    after: 1,
    pulses: 5,
  };
  const cues = [{ settings, point: { x: 0.5, y: 0.5 }, anchor: 2, start: 1, end: 3 }];
  expect(evaluateReviewClicks(cues, 0.9)).toEqual([]);
  expect(evaluateReviewClicks(cues, 1)[0]!.lens!.scale).toBe(1);
  expect(evaluateReviewClicks(cues, 2)[0]).toMatchObject({ radius: 160, lens: { scale: 2 } });
  expect(evaluateReviewClicks(cues, 2)[0]!.lens!.optics).toBe('flat');
  expect(
    evaluateReviewClicks([{ ...cues[0]!, settings: { ...settings, lensOptics: 'optical' } }], 2)[0]!
      .lens!.optics
  ).toBe('optical');
  expect(
    evaluateReviewClicks(
      [{ ...cues[0]!, settings: { ...settings, lensOptics: 'optical', lensEdgeWidth: 4 } }],
      2
    )[0]!.lens
  ).toMatchObject({ optics: 'optical', edgeWidth: 4 });
  expect(evaluateReviewClicks(cues, 2.5)[0]!.lens!.scale).toBeGreaterThan(1);
  expect(evaluateReviewClicks(cues, 2.999)[0]!.lens!.scale).toBeCloseTo(1, 2);
  expect(evaluateReviewClicks(cues, 3)).toEqual([]);
  // A cut bounds the ramp, without extending the effect across the cut.
  expect(
    evaluateReviewClicks([{ ...cues[0]!, start: 1.5, end: 2.5 }], 2.4999)[0]!.lens!.scale
  ).toBeCloseTo(1, 2);
});

it('keeps an optical click style from turning a recorded drag into a lens', () => {
  const style = {
    ...REVIEW_CLICK_DEFAULT,
    id: 'drag',
    effect: 'magnify' as const,
    lensOptics: 'optical' as const,
    gestureAppearance: 'path' as const,
  };
  const gesture: ReviewTelemetryMarker = {
    ...marker,
    ref: { kind: 'action', id: 'drag' },
    start: 1,
    end: 2,
    gesture: {
      id: 'drag',
      type: 'selection',
      button: 0,
      downTime: 1,
      upTime: 2,
      completion: 'released',
      path: [
        { time: 1, x: 0.2, y: 0.3 },
        { time: 2, x: 0.8, y: 0.7 },
      ],
      gaps: [{ start: 1.7, end: 1.8 }],
    },
  };
  const cues = scheduleReviewClicks([gesture], [style], buildReviewTimeMap(4, []));
  expect(cues).toHaveLength(1);
  expect(evaluateReviewClicks(cues, 1.7)).toEqual([]);
  expect(evaluateReviewClicks(cues, 1.5)[0]).toMatchObject({
    effect: 'press',
    point: { x: 0.5, y: 0.5 },
  });
  expect(evaluateReviewClicks(cues, 1.5)[0]).not.toHaveProperty('lens');
});

it('creates an area on explicit selection and preserves existing batch rectangles', () => {
  const original = patchReviewClicks([], ['existing'], {
    effect: 'press',
    gestureArea: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  });
  const unchanged = patchReviewClicks(original, ['new'], { effect: 'press' });
  expect(unchanged.find((style) => style.id === 'new')).not.toHaveProperty('gestureArea');
  const facts: ReviewTelemetryMarker[] = [
    {
      ...marker,
      ref: { kind: 'action', id: 'new' },
      gesture: {
        id: 'new',
        type: 'selection',
        button: 0,
        downTime: 1,
        upTime: 2,
        completion: 'released',
        path: [
          { time: 1, x: 0.8, y: 0.7 },
          { time: 2, x: 0.2, y: 0.1 },
        ],
      },
    },
  ];
  const source = structuredClone(facts);
  const area = patchReviewClicks(
    unchanged,
    ['existing', 'new'],
    { gestureAppearance: 'area' },
    facts
  );
  expect(facts).toEqual(source);
  expect(area.find((style) => style.id === 'existing')!.gestureArea).toEqual(
    original[0]!.gestureArea
  );
  expect(area.find((style) => style.id === 'new')!.gestureArea).toEqual({
    x: 0.2,
    y: 0.1,
    width: 0.6000000000000001,
    height: 0.6,
  });
});

it('does not invent a central frame without observed geometry', () => {
  expect(patchReviewClicks([], ['missing'], { gestureAppearance: 'area' })[0]).not.toHaveProperty(
    'gestureArea'
  );
});

it('keeps a point-only frame visible within the source bounds', () => {
  const result = patchReviewClicks([], ['click'], { gestureAppearance: 'area' }, [
    { ...marker, focusPoint: { x: 1, y: 1 } },
  ]);
  expect(result[0]!.gestureArea).toEqual({ x: 0.99, y: 0.99, width: 0.01, height: 0.01 });
});
