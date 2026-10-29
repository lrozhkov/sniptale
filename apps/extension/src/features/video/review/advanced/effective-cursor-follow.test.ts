import { expect, it } from 'vitest';
import { evaluateQuickEditCameraAtTime, resolveReviewSceneCameraPlan } from './scene';
import { createQuickEditZoomRegion } from './zoom';
import { createQuickEditAdvancedState } from './defaults';
import { loadQuickEditAdvancedContentState } from './validation';
import { resolveQuickEditEffectiveState } from './effective';

it('applies local cursor mode independently of the scene default and neighboring camera', () => {
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.ui.tracks.zoom = true;
  state.zoom.enabled = true;
  state.cursorFocusPath = {
    version: 1,
    smoothing: 0.5,
    sensitivity: 0.5,
    mode: 'fixed',
    gapPolicy: 'hold',
    segments: [
      {
        id: 'focus',
        binding: { kind: 'project' },
        start: 0,
        end: 6,
        keys: [
          {
            id: 'a',
            time: 0,
            x: 0.2,
            y: 0.4,
            anchor: 'manual',
            authored: true,
            interpolation: 'smooth',
          },
          {
            id: 'b',
            time: 6,
            x: 0.8,
            y: 0.4,
            anchor: 'manual',
            authored: true,
            interpolation: 'smooth',
          },
        ],
      },
    ],
  };
  state.zoom.regions = [
    Object.assign(createQuickEditZoomRegion({ id: 'local', at: 0, duration: 2, endMax: 6 }), {
      followCursor: true,
      enter: { type: 'none', duration: 0 },
      exit: { type: 'none', duration: 0 },
    }),
    Object.assign(createQuickEditZoomRegion({ id: 'fixed', at: 3, duration: 2, endMax: 6 }), {
      followCursor: false,
    }),
  ];
  const local = resolveQuickEditEffectiveState(state);
  expect(local.zoomRegions[0]?.cursorFocus?.path.mode).toBe('follow');
  expect(local.zoomRegions[1]?.cursorFocus).toBeUndefined();
  expect(
    evaluateQuickEditCameraAtTime(local.zoomRegions, 1, {
      source: { width: 1000, height: 600 },
      background: { enabled: false },
    }).centerX
  ).not.toBe(0.5);
  expect(state.cursorFocusPath.mode).toBe('fixed');
  state.cursorFocusPath.mode = 'follow';
  const global = resolveQuickEditEffectiveState(state);
  expect(global.zoomRegions[0]?.cursorFocus?.path.mode).toBe('follow');
  expect(global.zoomRegions[1]?.cursorFocus).toBeUndefined();
});

it('retains local follow and fixed policies through receiving admission and rejects malformed flags', () => {
  const content = createQuickEditAdvancedState();
  content.zoom.regions = [
    Object.assign(createQuickEditZoomRegion({ id: 'camera', at: 0, duration: 2, endMax: 4 }), {
      followCursor: true,
    }),
  ];
  const { ui: _ui, ...body } = content;
  expect(loadQuickEditAdvancedContentState(body)?.zoom.regions[0]).toHaveProperty(
    'followCursor',
    true
  );
  expect(
    loadQuickEditAdvancedContentState({
      ...body,
      zoom: {
        ...body.zoom,
        regions: body.zoom.regions.map((region) => ({ ...region, followCursor: 'yes' })),
      },
    })
  ).toBeNull();
});

it('reuses camera plans after unrelated settings snapshots and invalidates changed inputs', () => {
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.zoom.enabled = true;
  state.ui.tracks.zoom = true;
  state.zoom.regions = [
    {
      ...createQuickEditZoomRegion({ id: 'camera', at: 0, duration: 2, endMax: 4 }),
      followCursor: true,
    },
  ];
  const input = {
    facts: { cursorTrack: null, actionEvents: [], signals: [] },
    source: { width: 1000, height: 600, duration: 4 },
  };
  const original = resolveQuickEditEffectiveState(state, input);
  const plan = resolveReviewSceneCameraPlan(original.zoomRegions, original.zoomRegions[0]!);
  expect(plan).not.toBeNull();
  const changed = structuredClone(state);
  changed.audio.original.volume = 0.5;
  const repeated = resolveQuickEditEffectiveState(changed, input);
  expect(repeated.zoomRegions[0]).toBe(original.zoomRegions[0]);
  expect(resolveReviewSceneCameraPlan(repeated.zoomRegions, repeated.zoomRegions[0]!)).toBe(plan);
  changed.zoom.regions[0]!.transform.scale += 0.5;
  expect(resolveQuickEditEffectiveState(changed, input).zoomRegions).not.toBe(original.zoomRegions);
  expect(
    resolveQuickEditEffectiveState(state, { ...input, facts: { ...input.facts } }).zoomRegions
  ).not.toBe(original.zoomRegions);
});
