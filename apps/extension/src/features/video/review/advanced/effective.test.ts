import { expect, it } from 'vitest';
import { createQuickEditAdvancedState } from './defaults';
import { hasSuppressedAdvancedFeatures, resolveQuickEditEffectiveFeatures } from './effective';
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
