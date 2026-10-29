import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from './defaults';
import { resolveQuickEditEffectiveState } from './effective';
it('retains an unchanged camera projection while a neighboring border draft changes', async () => {
  const { createQuickEditZoomRegion } = await import('./zoom');
  const { createQuickEditBorder } = await import('../../project/scene/focus-appearance');
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.ui.tracks.zoom = true;
  state.zoom = {
    enabled: true,
    regions: [
      { ...createQuickEditZoomRegion({ id: 'camera', at: 0 }), followCursor: true },
      { ...createQuickEditZoomRegion({ id: 'border', at: 0 }), border: createQuickEditBorder() },
    ],
  };
  const facts = { cursorTrack: null, actionEvents: [], signals: [] };
  const input = { facts, source: { width: 1280, height: 720, duration: 20 } };
  const original = resolveQuickEditEffectiveState(state, input).zoomRegions;
  const changed = {
    ...state,
    zoom: {
      ...state.zoom,
      regions: state.zoom.regions.map((region) =>
        region.border
          ? { ...region, border: { ...region.border, area: { ...region.border.area, x: 0.2 } } }
          : region
      ),
    },
  };
  const projected = resolveQuickEditEffectiveState(changed, input).zoomRegions;
  expect(projected[0]).toBe(original[0]);
  expect(projected[0]?.cursorFocus).toBe(original[0]?.cursorFocus);
  expect(projected[1]?.border?.area.x).toBe(0.2);
});

it('retains frequently used cameras throughout a long neighboring drag', async () => {
  const { createQuickEditZoomRegion } = await import('./zoom');
  const { createQuickEditBorder } = await import('../../project/scene/focus-appearance');
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.ui.tracks.zoom = true;
  const camera = { ...createQuickEditZoomRegion({ id: 'camera', at: 0 }), followCursor: true };
  const border = {
    ...createQuickEditZoomRegion({ id: 'border', at: 0 }),
    border: createQuickEditBorder(),
  };
  state.zoom = { enabled: true, regions: [camera, border] };
  const input = {
    facts: { cursorTrack: null, actionEvents: [], signals: [] },
    source: { width: 1280, height: 720, duration: 20 },
  };
  const original = resolveQuickEditEffectiveState(state, input).zoomRegions[0];
  for (let i = 0; i < 200; i++) {
    const draft = {
      ...state,
      zoom: {
        ...state.zoom,
        regions: [
          camera,
          { ...border, border: { ...border.border, area: { ...border.border.area, x: i / 1000 } } },
        ],
      },
    };
    expect(resolveQuickEditEffectiveState(draft, input).zoomRegions[0]).toBe(original);
  }
});

it('invalidates camera context when policy, source geometry or authored timing changes', async () => {
  const { createQuickEditZoomRegion } = await import('./zoom');
  const { createCameraFollowSettings } = await import('../../project/camera/cursor-policy');
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.ui.tracks.zoom = true;
  state.zoom = {
    enabled: true,
    regions: [{ ...createQuickEditZoomRegion({ id: 'camera', at: 0 }), followCursor: true }],
  };
  const input = {
    facts: { cursorTrack: null, actionEvents: [], signals: [] },
    source: { width: 1280, height: 720, duration: 20 },
  };
  const resolve = (value = state, source = input.source) =>
    resolveQuickEditEffectiveState(value, { ...input, source }).zoomRegions[0]!;
  const original = resolve();
  const policy = resolve({ ...state, cameraFollowDefaults: createCameraFollowSettings('fast') });
  expect(policy.cursorFocus).not.toBe(original.cursorFocus);
  expect(policy.cursorFocus?.policy?.settings.transitionDuration).toBe(0.2);
  const geometry = resolve(state, { ...input.source, width: 1920 });
  expect(geometry.cursorFocus?.scene?.source.width).toBe(1920);
  expect(original.cursorFocus?.scene?.source.width).toBe(1280);
  const timing = resolve({
    ...state,
    zoom: { ...state.zoom, regions: [{ ...state.zoom.regions[0]!, start: 2 }] },
  });
  expect(timing.start).toBe(2);
  expect(timing).not.toBe(original);
});
