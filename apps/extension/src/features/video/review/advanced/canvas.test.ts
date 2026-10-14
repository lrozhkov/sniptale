import { expect, it } from 'vitest';
import {
  computeQuickEditSceneLayout,
  quickEditCropCamera,
  evaluateQuickEditCameraAtTime,
  quickEditContentPointToCanvas,
  quickEditCanvasPointToContent,
} from './scene';
import { replayReviewHistory } from '../document';
import { parseQuickEditCanvas, quickEditCanvasPreset, fitQuickEditSourceCrop } from './canvas';
import { createQuickEditZoomRegion } from './zoom';
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

it('retains a bounded source crop and rejects crops in an older content schema', () => {
  const canvas = {
    width: 1080,
    height: 1920,
    crop: { x: 0.3, y: 0, width: 0.31640625, height: 1 },
  };
  const state = { ...createQuickEditAdvancedState(), canvas };
  expect(loadQuickEditAdvancedState(state)?.canvas).toEqual(canvas);
  expect(loadQuickEditAdvancedState({ ...state, schemaVersion: 20 })).toBeNull();
  for (const crop of [
    { ...canvas.crop, x: -0.1 },
    { ...canvas.crop, width: 0 },
    { ...canvas.crop, height: Infinity },
    { ...canvas.crop, x: 0.9 },
  ])
    expect(parseQuickEditCanvas({ ...canvas, crop })).toBeNull();
});

it('preserves source coordinates through crop, zoom, inverse mapping and resolution changes', () => {
  const source = { width: 1920, height: 1080 };
  const canvas = { width: 1080, height: 1920 };
  const crop = fitQuickEditSourceCrop(source, canvas);
  expect((crop.width * source.width) / (crop.height * source.height)).toBeCloseTo(9 / 16, 12);
  expect(fitQuickEditSourceCrop(source, { width: 540, height: 960 }, crop)).toEqual(crop);
  const layout = computeQuickEditSceneLayout({
    source,
    canvas: { ...canvas, crop },
    output: canvas,
    background: { enabled: false },
    camera: { scale: 2, centerX: 0.5, centerY: 0.5 },
  });
  const point = { x: 0.5, y: 0.5 };
  const projected = quickEditContentPointToCanvas(point, layout.videoTransform);
  expect(projected.x).toBeCloseTo(canvas.width / 2, 8);
  expect(projected.y).toBeCloseTo(canvas.height / 2, 8);
  expect(quickEditCanvasPointToContent(projected, layout.videoTransform)).toEqual(point);
  const square = fitQuickEditSourceCrop(source, { width: 1080, height: 1080 }, crop);
  expect(square.x + square.width / 2).toBeCloseTo(0.5, 12);
  expect(square.y + square.height / 2).toBeCloseTo(0.5, 12);
});

it('keeps manual zoom targets in source coordinates and clamps only the rendered camera', () => {
  const scene = {
    source: { width: 1600, height: 900 },
    canvas: { width: 800, height: 900, crop: { x: 0.25, y: 0, width: 0.5, height: 1 } },
    background: { enabled: false as const },
  };
  const region = createQuickEditZoomRegion({ id: 'manual', at: 0 });
  region.end = 4;
  region.enter = { type: 'none', duration: 0 };
  region.exit = { type: 'none', duration: 0 };
  region.transform = { scale: 2, centerX: 0.625, centerY: 0.5 };
  const camera = evaluateQuickEditCameraAtTime([region], 2, scene);
  expect(camera.centerX).toBe(0.75);
  expect(quickEditCropCamera(camera, scene, true)).toEqual(region.transform);
  const layout = computeQuickEditSceneLayout({ ...scene, output: scene.canvas, camera });
  expect(quickEditContentPointToCanvas({ x: 0.625, y: 0.5 }, layout.videoTransform)).toEqual({
    x: 400,
    y: 450,
  });
  region.transform = { scale: 2, centerX: 0.95, centerY: 0.5 };
  const outside = evaluateQuickEditCameraAtTime([region], 2, scene);
  const edge = computeQuickEditSceneLayout({ ...scene, output: scene.canvas, camera: outside });
  const right = quickEditContentPointToCanvas({ x: 0.75, y: 0.5 }, edge.videoTransform);
  expect(right.x).toBe(800);
  expect(region.transform.centerX).toBe(0.95);
});
