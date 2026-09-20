import { expect, it } from 'vitest';
import { computeQuickEditSceneLayout } from './scene';
import { replayReviewHistory } from '../document';
import { parseQuickEditCanvas, quickEditCanvasPreset } from './canvas';
import { createQuickEditAdvancedState } from './defaults';
import { loadQuickEditAdvancedState, loadQuickEditAdvancedContentState } from './validation';
import { reviewAdvancedContentBaseline } from '../document';
import { resolveQuickEditEffectiveState, resolveQuickEditExportPlan } from './effective';

it('bounds even canvas overrides and retains explicit size through the history parser', () => {
  const canvas = quickEditCanvasPreset(9, 16, 1080);
  expect(canvas).toEqual({ width: 1080, height: 1920 });
  expect(quickEditCanvasPreset(4, 3, 1080)).toEqual({ width: 1440, height: 1080 });
  for (const value of [
    { width: 0, height: 1080 },
    { width: 1081, height: 1920 },
    { width: 7680, height: 7680 },
    { width: Infinity, height: 1080 },
  ])
    expect(parseQuickEditCanvas(value)).toBeNull();
  const state = { ...createQuickEditAdvancedState(), canvas };
  expect(loadQuickEditAdvancedState(state)?.canvas).toEqual(canvas);
  expect(loadQuickEditAdvancedContentState(reviewAdvancedContentBaseline(state))?.canvas).toEqual(
    canvas
  );
  expect(loadQuickEditAdvancedState({ ...state, canvas: { width: -1, height: 0 } })).toBeNull();
});

it('applies the canvas and lane gains only in advanced mode without rewriting clip gains', () => {
  const state = createQuickEditAdvancedState();
  state.ui.mode = 'advanced';
  state.ui.tracks.audio = true;
  state.canvas = { width: 1080, height: 1920 };
  state.audio.laneVolumes = { voiceover: 0.25, music: 0.5 };
  state.audio.music = [
    {
      id: 'm',
      assetId: 'music',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 3,
      volume: 0.8,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  expect(resolveQuickEditEffectiveState(state).music[0]?.volume).toBe(0.4);
  expect(state.audio.music[0]?.volume).toBe(0.8);
  expect(resolveQuickEditEffectiveState(state).canvas).toEqual(state.canvas);
  expect(
    resolveQuickEditExportPlan({ advanced: state, document: { edits: [], canvasComments: [] } })
  ).toMatchObject({ video: 'render', reasons: expect.arrayContaining(['canvas']) });
  state.ui.mode = 'basic';
  expect(resolveQuickEditEffectiveState(state).canvas).toBeUndefined();
  expect(resolveQuickEditEffectiveState(state).music).toEqual([]);
  expect(loadQuickEditAdvancedState(state)?.audio.laneVolumes).toEqual({
    voiceover: 0.25,
    music: 0.5,
  });
  expect(
    loadQuickEditAdvancedState({
      ...state,
      audio: { ...state.audio, laneVolumes: { voiceover: 3, music: 1 } },
    })
  ).toBeNull();
});

it('keeps padding and camera geometry proportional between portrait preview and export', () => {
  const common = {
    source: { width: 1920, height: 1080 },
    canvas: { width: 1080, height: 1920 },
    background: {
      enabled: true as const,
      type: 'solid' as const,
      color: '#000000ff',
      layout: { padding: 100, cornerRadius: 20 },
    },
    camera: { scale: 2, centerX: 0.7, centerY: 0.3 },
  };
  const full = computeQuickEditSceneLayout({ ...common, output: common.canvas });
  const preview = computeQuickEditSceneLayout({ ...common, output: { width: 270, height: 480 } });
  for (const key of ['x', 'y', 'width', 'height'] as const)
    expect(preview.videoTransform[key]).toBeCloseTo(full.videoTransform[key] / 4);
  expect(full.contentRect.x).toBe(100);
});

it('undoes and redoes canvas and master gains through the same content operation', () => {
  const baseline = reviewAdvancedContentBaseline(createQuickEditAdvancedState());
  const after = {
    ...baseline,
    canvas: { width: 1080, height: 1920 },
    audio: { ...baseline.audio, laneVolumes: { voiceover: 0.4, music: 0.6 } },
  };
  const history = [
    { id: 'scene', at: 1, target: 'advancedContent' as const, before: baseline, after },
  ];
  const source = { duration: 4, width: 1920, height: 1080, mimeType: 'video/webm', size: 5 };
  expect(replayReviewHistory(history, 0, source, baseline).advancedContent).toEqual(baseline);
  expect(replayReviewHistory(history, 1, source, baseline).advancedContent).toEqual(after);
});
