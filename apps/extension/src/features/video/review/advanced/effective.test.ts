import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from './defaults';
import {
  hasSuppressedAdvancedFeatures,
  resolveQuickEditEffectiveFeatures,
  resolveQuickEditEffectiveState,
  resolveQuickEditExportSupport,
} from './effective';
import { createCanvasComment } from '../comments';
import type { QuickEditAdvancedState } from './types';

const advancedWithContent = (): QuickEditAdvancedState => ({
  ...createQuickEditAdvancedState(),
  ui: { mode: 'advanced', tracks: { actions: true, zoom: true, audio: true } },
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
    ui: { mode: 'basic', tracks: { actions: true, zoom: true, audio: true } },
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

  // Track visibility alone never changes the applied configuration.
  const hidden = resolveQuickEditEffectiveState({
    ...stored,
    ui: { ...stored.ui, tracks: { actions: true, zoom: false, audio: false } },
  });
  expect(hidden.zoomRegions).toEqual(stored.zoom.regions);
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

it('blocks the current exporter when advanced presentation would be dropped', () => {
  const document = (renderToVideo: boolean) => ({
    edits: [],
    canvasComments: [{ ...createCanvasComment({ id: 'c', at: 0 }), renderToVideo }],
  });
  const state = advancedWithContent();
  state.zoom = { enabled: true, regions: [regionStub()] };
  const blocked = resolveQuickEditExportSupport({
    document: document(true),
    advanced: state,
  });
  if (blocked.ok) throw new Error('expected blocked export');
  expect([...blocked.blockers]).toEqual(
    expect.arrayContaining(['zoom', 'background', 'burned-comment'])
  );
  const unburned = resolveQuickEditExportSupport({
    document: document(false),
    advanced: state,
  });
  if (unburned.ok) throw new Error('expected blocked export');
  expect([...unburned.blockers]).not.toContain('burned-comment');

  const voice = advancedWithContent();
  voice.background = { enabled: false };
  voice.zoom = { enabled: false, regions: [] };
  voice.audio.voiceover = [voiceClipStub()];
  const voiceBlocked = resolveQuickEditExportSupport({
    document: document(false),
    advanced: voice,
  });
  if (voiceBlocked.ok) throw new Error('expected blocked voiceover export');
  expect([...voiceBlocked.blockers]).toEqual(['voiceover']);

  const original = advancedWithContent();
  original.zoom = { enabled: false, regions: [] };
  original.background = { enabled: false };
  original.audio.original = { muted: false, volume: 1.5 };
  expect(
    resolveQuickEditExportSupport({ document: document(false), advanced: original })
  ).toMatchObject({
    ok: false,
    blockers: ['original-audio'],
  });
});

it('lets the basic path export basic changes even with stored advanced settings', () => {
  const basic = advancedWithContent();
  basic.ui.mode = 'basic';
  expect(
    resolveQuickEditExportSupport({
      document: {
        edits: [{ kind: 'cut', start: 0, end: 1 } as never],
        canvasComments: [],
      },
      advanced: basic,
    })
  ).toMatchObject({ ok: true });
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
