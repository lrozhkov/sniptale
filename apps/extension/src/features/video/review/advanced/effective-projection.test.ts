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

function sceneProjectionFixture() {
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.ui.tracks.zoom = true;
  state.zoom.enabled = true;
  state.background = {
    enabled: true,
    type: 'solid',
    color: '#000000ff',
    zoomBehavior: 'window',
    layout: {
      padding: 40,
      cornerRadius: 12,
      blur: 0,
      shadow: { intensity: 10, color: '#000000ff' },
    },
  };
  state.windowHeader = {
    kind: 'browser',
    style: 'windows',
    theme: 'light',
    title: 'Title',
    url: 'example.test',
    faviconEnabled: false,
  };
  return {
    state,
    input: {
      facts: { cursorTrack: null, actionEvents: [], signals: [] },
      source: { width: 1280, height: 720, duration: 20 },
    },
  };
}

it.each(['paint', 'blur', 'shadow', 'header-title', 'header-theme', 'header-style'] as const)(
  'retains camera plans across a geometry-equivalent %s change while exposing the new decoration',
  async (kind) => {
    const { createQuickEditZoomRegion } = await import('./zoom');
    const { resolveReviewSceneCameraPlan } = await import('./scene');
    const { state, input } = sceneProjectionFixture();
    state.zoom.regions = [
      { ...createQuickEditZoomRegion({ id: 'camera', at: 0 }), followCursor: true },
    ];
    const original = resolveQuickEditEffectiveState(state, input);
    const plan = resolveReviewSceneCameraPlan(original.zoomRegions, original.zoomRegions[0]!);
    const changed = structuredClone(state);
    if (!changed.background.enabled || !changed.windowHeader) throw new Error('Expected scene');
    if (kind === 'paint' && changed.background.type === 'solid')
      changed.background.color = '#ffffff00';
    if (kind === 'blur') changed.background.layout.blur = 12;
    if (kind === 'shadow') changed.background.layout.shadow = { intensity: 90, color: '#ffffffff' };
    if (kind === 'header-title') changed.windowHeader.title = 'Changed title';
    if (kind === 'header-theme') changed.windowHeader.theme = 'dark';
    if (kind === 'header-style') changed.windowHeader.style = 'linux';
    const next = resolveQuickEditEffectiveState(changed, input);
    expect(next.background).toBe(changed.background);
    expect(next.windowHeader).toBe(changed.windowHeader);
    expect(next.zoomRegions[0]?.cursorFocus).toBe(original.zoomRegions[0]?.cursorFocus);
    expect(resolveReviewSceneCameraPlan(next.zoomRegions, next.zoomRegions[0]!)).toBe(plan);
  }
);

it.each(['padding', 'radius', 'header-height', 'crop'] as const)(
  'invalidates the camera projection after a scene %s change',
  async (kind) => {
    const { createQuickEditZoomRegion } = await import('./zoom');
    const { state, input } = sceneProjectionFixture();
    state.zoom.regions = [
      { ...createQuickEditZoomRegion({ id: 'camera', at: 0 }), followCursor: true },
    ];
    const original = resolveQuickEditEffectiveState(state, input);
    const changed = structuredClone(state);
    if (!changed.background.enabled || !changed.windowHeader) throw new Error('Expected scene');
    if (kind === 'padding') changed.background.layout.padding = 80;
    if (kind === 'radius') changed.background.layout.cornerRadius = 24;
    if (kind === 'header-height') changed.windowHeader.kind = 'application';
    if (kind === 'crop')
      changed.canvas = {
        width: 1280,
        height: 720,
        crop: { x: 0.1, y: 0.05, width: 0.8, height: 0.8 },
      };
    const next = resolveQuickEditEffectiveState(changed, input);
    expect(next.zoomRegions[0]?.cursorFocus).not.toBe(original.zoomRegions[0]?.cursorFocus);
    expect(original.background).toBe(state.background);
  }
);

it('retains source-clock paths across geometry, policy and edit-clock changes', async () => {
  const { createQuickEditZoomRegion } = await import('./zoom');
  const { createCameraFollowSettings } = await import('../../project/camera/cursor-policy');
  const { state, input } = sceneProjectionFixture();
  state.zoom.regions = [
    { ...createQuickEditZoomRegion({ id: 'camera', at: 0 }), followCursor: true },
  ];
  const original = resolveQuickEditEffectiveState(state, input).zoomRegions[0]!.cursorFocus!;
  for (const changed of [
    { ...state, canvas: { width: 720, height: 720 } },
    { ...state, cameraFollowDefaults: createCameraFollowSettings('fast') },
    { ...state, audio: { ...state.audio, voiceoverSegments: [] } },
  ]) {
    const next = resolveQuickEditEffectiveState(changed, input).zoomRegions[0]!.cursorFocus!;
    expect(next).not.toBe(original);
    expect(next.path.segments).toBe(original.path.segments);
    expect(next.observed).toBe(original.observed);
  }
});

it('invalidates source-clock paths for changed facts, source and sparse authoring', async () => {
  const { createQuickEditZoomRegion } = await import('./zoom');
  const { state, input } = sceneProjectionFixture();
  state.zoom.regions = [
    { ...createQuickEditZoomRegion({ id: 'camera', at: 0 }), followCursor: true },
  ];
  const resolve = (value = state, facts = input.facts, source = input.source) =>
    resolveQuickEditEffectiveState(value, { facts, source }).zoomRegions[0]!.cursorFocus!;
  const original = resolve();
  for (const source of [
    { ...input.source, width: 1920 },
    { ...input.source, height: 1080 },
    { ...input.source, duration: 30 },
  ])
    expect(resolve(state, input.facts, source).observed).not.toBe(original.observed);
  expect(resolve(state, { ...input.facts }).observed).not.toBe(original.observed);
  const authored = {
    ...state,
    cursorFocusPath: { ...original.path, smoothing: 0.7 },
  };
  const changed = resolve(authored);
  expect(changed.path.smoothing).toBe(0.7);
  expect(changed.path.segments).not.toBe(original.path.segments);
  expect(original.path.smoothing).toBe(0.5);
});

it('retains captured and merged keys while applying current path scalar authoring', async () => {
  const { createQuickEditZoomRegion } = await import('./zoom');
  const { state, input } = sceneProjectionFixture();
  state.zoom.regions = [
    { ...createQuickEditZoomRegion({ id: 'camera', at: 0 }), followCursor: true },
  ];
  state.cursorFocusPath = {
    version: 1,
    mode: 'follow',
    gapPolicy: 'hold',
    smoothing: 0.5,
    sensitivity: 0.5,
    segments: [
      {
        id: 'manual',
        binding: { kind: 'project' },
        start: 0,
        end: 20,
        keys: [{ id: 'key', time: 1, x: 0.4, y: 0.5, anchor: 'manual', interpolation: 'smooth' }],
      },
    ],
  };
  const original = resolveQuickEditEffectiveState(state, input).zoomRegions[0]!.cursorFocus!;
  for (const patch of [{ smoothing: 0.7 }, { sensitivity: 0.9 }, { mode: 'fixed' as const }]) {
    const changed = { ...state, cursorFocusPath: { ...state.cursorFocusPath, ...patch } };
    const next = resolveQuickEditEffectiveState(changed, input).zoomRegions[0]!.cursorFocus!;
    expect(next).not.toBe(original);
    expect(next.path.smoothing).toBe(changed.cursorFocusPath.smoothing);
    expect(next.path.sensitivity).toBe(changed.cursorFocusPath.sensitivity);
    expect(next.path.segments).toBe(original.path.segments);
    expect(next.observed).toBe(original.observed);
  }
  const edited = structuredClone(state);
  edited.cursorFocusPath!.segments[0]!.keys[0]!.x = 0.8;
  const next = resolveQuickEditEffectiveState(edited, input).zoomRegions[0]!.cursorFocus!;
  expect(next.path.segments).not.toBe(original.path.segments);
  expect(next.path.segments[0]!.keys[0]!.x).toBe(0.8);
  expect(original.path.segments[0]!.keys[0]!.x).toBe(0.4);
});
