import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from './defaults';
import { resolveQuickEditEffectiveState, resolveQuickEditExportPlan } from './effective';
import { createQuickEditZoomRegion } from './zoom';
import { buildReviewTimeMap } from '../timeline';

it('does not require renderers for authored effects entirely hidden by a cut', () => {
  const cut = {
    id: 'cut',
    kind: 'cut' as const,
    start: 2,
    end: 4,
    requestedStart: 2,
    requestedEnd: 4,
  };
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.ui.tracks.zoom = true;
  state.ui.tracks.audio = true;
  state.zoom.enabled = true;
  state.background = { enabled: false };
  state.audio.voiceoverSegments = buildReviewTimeMap(8, [cut]);
  state.zoom.regions = [
    {
      ...createQuickEditZoomRegion({ id: 'focus', at: 2, duration: 1 }),
      sourceAnchor: { start: 2, end: 3 },
    },
  ];
  state.audio.voiceover = [
    {
      id: 'voice',
      assetId: 'voice-asset',
      sourceOffset: 0,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      timelineStart: 2,
      duration: 1,
      sourceAnchor: [{ start: 2, end: 3, offset: 0, duration: 1 }],
    },
  ];
  state.audio.music = [
    {
      id: 'music',
      assetId: 'music-asset',
      timelineStart: 7,
      sourceOffset: 0,
      duration: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  state.audio.original.ranges = [{ id: 'gain', start: 2, end: 3, volume: 0.5 }];
  expect(resolveQuickEditEffectiveState(state)).toMatchObject({
    zoomRegions: [],
    voiceover: [],
    music: [],
  });
  expect(
    resolveQuickEditExportPlan({ advanced: state, document: { edits: [cut], canvasComments: [] } })
  ).toEqual({
    kind: 'ready',
    video: 'copy',
    audio: 'copy',
    reasons: [],
  });
  state.audio.voiceoverSegments = buildReviewTimeMap(8, []);
  expect(resolveQuickEditEffectiveState(state).music).toHaveLength(1);
});

it('keeps packet copy available when a cut fully hides off-keyframe speed boundaries', () => {
  const cut = {
    id: 'cut',
    kind: 'cut' as const,
    start: 2,
    end: 4,
    requestedStart: 2,
    requestedEnd: 4,
  };
  const speed = {
    id: 'speed',
    kind: 'speed' as const,
    start: 2.25,
    end: 3.75,
    requestedStart: 2.25,
    requestedEnd: 3.75,
    rate: 2 as const,
    audio: 'mute' as const,
  };
  expect(
    resolveQuickEditExportPlan({
      advanced: createQuickEditAdvancedState(),
      document: { edits: [cut, speed], canvasComments: [] },
      videoCopyBoundaries: [0, 2, 4, 8],
      videoRenderAvailable: false,
    })
  ).toEqual({ kind: 'ready', video: 'copy', audio: 'copy', reasons: [] });
});

it('projects only surviving authored focus frames for playback and export across a Cut', () => {
  const cut = {
    id: 'cut',
    kind: 'cut' as const,
    start: 3,
    end: 7,
    requestedStart: 3,
    requestedEnd: 7,
  };
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.ui.tracks.zoom = true;
  state.zoom.enabled = true;
  state.background = { enabled: false };
  state.audio.voiceoverSegments = buildReviewTimeMap(10, [cut]);
  state.zoom.regions = [
    {
      ...createQuickEditZoomRegion({ id: 'focus', at: 2, duration: 3 }),
      sourceAnchor: { start: 2, end: 9 },
    },
  ];
  expect(
    resolveQuickEditEffectiveState(state).zoomRegions.map(({ start, end }) => ({ start, end }))
  ).toEqual([
    { start: 2, end: 3 },
    { start: 3, end: 5 },
  ]);
  expect(
    resolveQuickEditExportPlan({
      advanced: state,
      document: { edits: [cut], canvasComments: [] },
      videoRenderAvailable: true,
    })
  ).toMatchObject({ kind: 'ready', video: 'render' });
  state.zoom.regions[0]!.sourceAnchor = { start: 4, end: 6 };
  expect(resolveQuickEditEffectiveState(state).zoomRegions).toEqual([]);
  expect(
    resolveQuickEditExportPlan({ advanced: state, document: { edits: [cut], canvasComments: [] } })
  ).toMatchObject({ kind: 'ready', video: 'copy' });
});
