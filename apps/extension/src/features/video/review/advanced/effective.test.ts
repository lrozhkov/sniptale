import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from './defaults';
import {
  hasSuppressedAdvancedFeatures,
  resolveQuickEditEffectiveFeatures,
  resolveQuickEditEffectiveState,
  resolveQuickEditExportPlan,
} from './effective';
import { createCanvasComment } from '../comments';
import type { QuickEditAdvancedState } from './types';

const advancedWithContent = (): QuickEditAdvancedState => ({
  ...createQuickEditAdvancedState(),
  ui: {
    mode: 'advanced',
    tracks: { actions: true, zoom: true, audio: true },
    overlaysVisible: true,
  },
  zoom: { enabled: true, regions: [] },
  background: {
    enabled: true,
    type: 'solid',
    color: '#000000ff',
    layout: { padding: 0, cornerRadius: 0 },
  },
});

it('keeps track visibility independent of mode and suppresses effects in basic mode', () => {
  const advanced = resolveQuickEditEffectiveFeatures(advancedWithContent());
  expect(advanced).toMatchObject({
    mode: 'advanced',
    actionsTrackVisible: true,
    zoomTrackVisible: true,
    audioTrackVisible: true,
    zoomApplied: true,
    backgroundApplied: true,
    originalAudioApplied: true,
    voiceoverApplied: true,
    musicApplied: true,
  });
  const basic = resolveQuickEditEffectiveFeatures({
    ...advancedWithContent(),
    ui: {
      mode: 'basic',
      tracks: { actions: true, zoom: true, audio: true },
      overlaysVisible: true,
    },
  });
  expect(basic).toMatchObject({
    mode: 'basic',
    actionsTrackVisible: true,
    zoomTrackVisible: false,
    audioTrackVisible: false,
    zoomApplied: false,
    backgroundApplied: false,
    originalAudioApplied: false,
  });
});

it('reports suppressed advanced content for the basic-mode hint', () => {
  expect(hasSuppressedAdvancedFeatures(createQuickEditAdvancedState())).toBe(false);
  const state = advancedWithContent();
  state.ui.mode = 'basic';
  expect(hasSuppressedAdvancedFeatures(state)).toBe(true);
  const musicOnly = createQuickEditAdvancedState();
  musicOnly.audio.music = [musicStub()];
  expect(hasSuppressedAdvancedFeatures(musicOnly)).toBe(true);
});

it('returns the applied configuration for stage, mixer, and exporter (R04)', () => {
  const stored = advancedWithContent();
  stored.zoom = { enabled: true, regions: [regionStub()] };
  stored.audio.original = { muted: true, volume: 0.5 };
  stored.audio.voiceover = [voiceClipStub()];
  const advanced = resolveQuickEditEffectiveState(stored);
  expect(advanced.zoomRegions).toEqual(stored.zoom.regions);
  expect(advanced.background).toEqual(stored.background);
  expect(advanced.originalAudio).toEqual({ muted: true, volume: 0.5 });
  expect(advanced.voiceover).toEqual(stored.audio.voiceover);

  const basic = resolveQuickEditEffectiveState({ ...stored, ui: { ...stored.ui, mode: 'basic' } });
  expect(basic.zoomRegions).toEqual([]);
  expect(basic.background).toEqual({ enabled: false });
  expect(basic.originalAudio).toEqual({ muted: false, volume: 1 });
  expect(basic.voiceover).toEqual([]);
  expect(basic.music).toEqual([]);

  // Hidden effect lanes are suppressed without changing the stored content.
  const hidden = resolveQuickEditEffectiveState({
    ...stored,
    ui: { ...stored.ui, tracks: { actions: true, zoom: false, audio: false } },
  });
  expect(hidden.zoomRegions).toEqual([]);
  expect(hidden.background).toEqual(stored.background);

  // Dormant placements stay stored but never apply.
  const dormantStored = resolveQuickEditEffectiveState({
    ...stored,
    zoom: {
      enabled: true,
      regions: [...stored.zoom.regions, { ...regionStub(), dormant: true }],
    },
    audio: {
      ...stored.audio,
      voiceover: [...stored.audio.voiceover, { ...voiceClipStub(), dormant: true }],
    },
  });
  expect(dormantStored.zoomRegions).toEqual(stored.zoom.regions);
  expect(dormantStored.voiceover).toEqual(stored.audio.voiceover);
});

function musicStub() {
  return {
    id: 'm',
    assetId: 'asset:m',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
}

it('plans render requirements and audio-only processing from applied changes', () => {
  const document = (renderToVideo: boolean) => ({
    edits: [],
    canvasComments: [{ ...createCanvasComment({ id: 'c', at: 0 }), renderToVideo }],
  });
  const state = advancedWithContent();
  state.zoom = { enabled: true, regions: [regionStub()] };
  const blocked = resolveQuickEditExportPlan({
    document: document(true),
    advanced: state,
  });
  expect(blocked).toMatchObject({
    kind: 'ready',
    video: 'render',
    audio: 'copy',
    reasons: ['zoom', 'background'],
  });
  const visual = resolveQuickEditExportPlan({
    document: document(false),
    advanced: state,
  });
  expect(visual).toMatchObject({
    kind: 'ready',
    video: 'render',
    audio: 'copy',
    reasons: ['zoom', 'background'],
  });
  expect(
    resolveQuickEditExportPlan({
      document: document(true),
      advanced: {
        ...createQuickEditAdvancedState(),
        ui: { ...createQuickEditAdvancedState().ui, mode: 'advanced' },
      },
      videoRenderAvailable: false,
    })
  ).toMatchObject({ kind: 'ready', video: 'copy', audio: 'copy', reasons: [] });
  expect(
    resolveQuickEditExportPlan({
      document: document(true),
      advanced: {
        ...createQuickEditAdvancedState(),
        ui: { ...createQuickEditAdvancedState().ui, mode: 'advanced' },
      },
    })
  ).toMatchObject({ kind: 'ready', video: 'copy', audio: 'copy', reasons: [] });
  expect(
    resolveQuickEditExportPlan({
      document: document(false),
      advanced: state,
      videoRenderAvailable: false,
    })
  ).toMatchObject({ kind: 'unavailable', reasons: ['video-encoder'] });

  const visualWithAudio = advancedWithContent();
  visualWithAudio.audio.music = [musicStub()];
  expect(
    resolveQuickEditExportPlan({
      document: document(false),
      advanced: visualWithAudio,
    })
  ).toMatchObject({
    kind: 'ready',
    video: 'render',
    audio: 'process',
    reasons: ['background', 'music'],
  });
  expect(
    resolveQuickEditExportPlan({
      document: document(false),
      advanced: visualWithAudio,
      videoRenderAvailable: false,
    })
  ).toMatchObject({
    kind: 'unavailable',
    reasons: ['video-encoder', 'music'],
  });

  const voice = advancedWithContent();
  voice.background = { enabled: false };
  voice.zoom = { enabled: false, regions: [] };
  voice.audio.voiceover = [voiceClipStub()];
  expect(resolveQuickEditExportPlan({ document: document(false), advanced: voice })).toMatchObject({
    kind: 'ready',
    video: 'copy',
    audio: 'process',
    reasons: ['voiceover'],
  });
  expect(
    resolveQuickEditExportPlan({
      document: document(false),
      advanced: voice,
      audioProcessingAvailable: false,
    })
  ).toMatchObject({ kind: 'unavailable', reasons: ['audio-encoder'] });

  const original = advancedWithContent();
  original.zoom = { enabled: false, regions: [] };
  original.background = { enabled: false };
  original.audio.original = { muted: false, volume: 1.5 };
  expect(
    resolveQuickEditExportPlan({ document: document(false), advanced: original })
  ).toMatchObject({
    kind: 'ready',
    audio: 'process',
    reasons: ['original-audio'],
  });

  const none = advancedWithContent();
  none.zoom = { enabled: false, regions: [] };
  none.background = { enabled: false };
  expect(resolveQuickEditExportPlan({ document: document(false), advanced: none })).toMatchObject({
    kind: 'ready',
    video: 'copy',
    audio: 'copy',
    reasons: [],
  });
});

it('lets the basic path export basic changes even with stored advanced settings', () => {
  const basic = advancedWithContent();
  basic.ui.mode = 'basic';
  expect(
    resolveQuickEditExportPlan({
      document: {
        edits: [{ kind: 'cut', start: 0, end: 1 } as never],
        canvasComments: [],
      },
      advanced: basic,
    })
  ).toMatchObject({ kind: 'ready', video: 'copy', audio: 'copy', reasons: [] });
});

function regionStub() {
  return {
    id: 'z',
    start: 1,
    end: 2,
    transform: { scale: 1.5, centerX: 0.5, centerY: 0.5 },
    enter: { type: 'ease-in-out' as const, duration: 0.3 },
    exit: { type: 'ease-in-out' as const, duration: 0.3 },
  };
}

function voiceClipStub() {
  return { ...musicStub(), id: 'v' };
}

it('temporarily excludes burned overlays in basic mode without deleting them', () => {
  const advanced = createQuickEditAdvancedState();
  advanced.ui.mode = 'basic';
  const comment = createCanvasComment({ id: 'overlay', at: 0, position: { x: 0.5, y: 0.5 } });
  expect(resolveQuickEditEffectiveFeatures(advanced).overlaysVisible).toBe(false);
  expect(
    resolveQuickEditExportPlan({ document: { edits: [], canvasComments: [comment] }, advanced })
  ).toMatchObject({ video: 'copy', reasons: [] });
  expect(comment.renderToVideo).toBe(true);
});

it('renders exact cuts between keyframes even after returning to basic mode', () => {
  const advanced = createQuickEditAdvancedState();
  const document = {
    canvasComments: [],
    edits: [
      {
        id: 'cut',
        kind: 'cut' as const,
        start: 0.3,
        end: 1.4,
        requestedStart: 0.3,
        requestedEnd: 1.4,
      },
    ],
  };
  for (const mode of ['basic', 'advanced'] as const) {
    advanced.ui.mode = mode;
    expect(
      resolveQuickEditExportPlan({
        advanced,
        document,
        videoCopyBoundaries: [0, 2, 4],
        videoRenderAvailable: true,
      })
    ).toMatchObject({ video: 'render', reasons: ['precise-edits'] });
    expect(
      resolveQuickEditExportPlan({
        advanced,
        document,
        videoCopyBoundaries: [0, 2, 4],
        videoRenderAvailable: false,
      })
    ).toEqual({ kind: 'unavailable', reasons: ['video-encoder'] });
    expect(
      resolveQuickEditExportPlan({
        advanced,
        document: { ...document, edits: [{ ...document.edits[0]!, start: 0, end: 2 }] },
        videoCopyBoundaries: [0, 2, 4],
      })
    ).toMatchObject({ video: 'copy' });
  }
});

it('suppresses disabled focus and added audio in preview/export while retaining original audio', () => {
  const state = advancedWithContent();
  state.zoom.regions = [regionStub()];
  state.background = { enabled: false };
  state.audio.voiceover = [voiceClipStub()];
  state.audio.music = [musicStub()];
  state.audio.original = { muted: true, volume: 0.4 };
  const content = structuredClone({ zoom: state.zoom, audio: state.audio });
  state.ui.tracks.zoom = false;
  state.ui.tracks.audio = false;
  const applied = resolveQuickEditEffectiveState(state);
  expect(applied).toMatchObject({
    zoomApplied: false,
    voiceoverApplied: false,
    musicApplied: false,
    zoomRegions: [],
    voiceover: [],
    music: [],
    originalAudio: state.audio.original,
  });
  expect(
    resolveQuickEditExportPlan({ advanced: state, document: { edits: [], canvasComments: [] } })
  ).toEqual({ kind: 'ready', video: 'copy', audio: 'process', reasons: ['original-audio'] });
  state.audio.original = { muted: false, volume: 1 };
  expect(
    resolveQuickEditExportPlan({
      advanced: state,
      document: { edits: [], canvasComments: [] },
      audioProcessingAvailable: false,
      videoRenderAvailable: false,
    })
  ).toEqual({ kind: 'ready', video: 'copy', audio: 'copy', reasons: [] });
  state.audio.original = content.audio.original;
  state.ui.tracks.zoom = true;
  state.ui.tracks.audio = true;
  expect(resolveQuickEditEffectiveState(state)).toMatchObject({
    zoomRegions: content.zoom.regions,
    voiceover: content.audio.voiceover,
    music: content.audio.music,
  });
  expect({ zoom: state.zoom, audio: state.audio }).toEqual(content);
});
