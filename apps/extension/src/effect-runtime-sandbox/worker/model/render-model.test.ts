import { expect, it } from 'vitest';

import { createDocument } from '../interpreter/support.test-support';
import {
  indexClips,
  indexLayers,
  indexTimeline,
  isPhaseEnabled,
  isSceneEnabled,
} from './render-index';
import {
  normalizeClips,
  normalizeLayers,
  normalizePathPoints,
  normalizeScenes,
  normalizeTimeline,
  resolveScene,
} from './render-normalization';
import {
  isLayerActive,
  resolveLayerState,
  resolvePhaseProgress,
  resolveTrackValue,
} from './render-resolver';
import { sampleRuntimeMotionPathTrackValue } from '../timeline/render-motion-path';

it('normalizes author collections into bounded runtime state', () => {
  const document = createDocument([]);
  document.scenes = [
    { duration: 1, enabled: false, id: 'disabled', start: 0 },
    { duration: 0, id: 'main', label: 'Main', locked: true, start: -1 },
  ];
  document.layers = [
    { id: 'group', type: 'group' },
    { id: 'card', name: 'Card', type: 'customDraw' },
  ];
  Object.assign(document.layers[1]!, {
    baseX: 'invalid',
    pathClosed: 'true',
    pathPoints: [{ x: 3, y: -3 }, null],
    visible: false,
  });
  document.clips = [{ duration: 0, layerId: 'card', offset: 1, sceneId: 'main', start: -1 }];

  const scenes = normalizeScenes(document.scenes, 0);
  const layers = normalizeLayers(document.layers);
  const clips = normalizeClips(document.clips, 2);

  expect(scenes[1]).toMatchObject({ duration: 1, id: 'main', locked: true, start: 0 });
  expect(resolveScene(0.5, scenes).id).toBe('main');
  expect(resolveScene(3, scenes).id).toBe('main');
  expect(resolveScene(0, []).id).toBe('main');
  expect(layers).toHaveLength(1);
  expect(layers[0]).toMatchObject({ baseX: null, pathClosed: true, visible: false });
  expect(clips[0]).toMatchObject({ duration: 2, layerId: 'card', start: 0 });
  expect(normalizePathPoints(null)).toEqual([]);
  expect(normalizePathPoints([{ x: 4, y: -4 }, 'bad'])).toEqual([{ x: 2, y: -2 }]);
});

it('indexes scenes, phases, tracks, layers, and clips with stable cache identity', () => {
  const model = createRuntimeModel();
  const firstTimelineIndex = indexTimeline(model.timeline);

  expect(indexTimeline(model.timeline)).toBe(firstTimelineIndex);
  expect(indexLayers(model.layers)).toBe(indexLayers(model.layers));
  expect(indexClips(model.clips)).toBe(indexClips(model.clips));
  expect(firstTimelineIndex.activeKeyframesByTrack.get(model.timeline.tracks[0]!)).toHaveLength(2);
  expect(isSceneEnabled(model.scenes)).toBe(true);
  expect(isSceneEnabled(model.scenes, 'disabled')).toBe(false);
  expect(isPhaseEnabled(model.timeline)).toBe(true);
  expect(isPhaseEnabled(model.timeline, 'phase')).toBe(true);
  expect(isPhaseEnabled(model.timeline, 'missing')).toBe(false);
});

it('resolves active clips, phases, keyframe ranges, interpolation, and fallbacks', () => {
  const model = createRuntimeModel();

  expect(isLayerActive([], 'card', 0, model.scenes)).toBe(true);
  expect(isLayerActive(model.clips, 'card', 0.5, model.scenes)).toBe(true);
  expect(isLayerActive(model.clips, 'card', 3, model.scenes)).toBe(false);
  expect(resolvePhaseProgress(model.timeline, 'phase', 0.5)).toBe(0.5);
  expect(resolvePhaseProgress(model.timeline, 'missing', 0.5)).toBe(0);
  expect(resolveTrackValue(model.timeline, 'card.x', -1, 99)).toBe(0);
  expect(resolveTrackValue(model.timeline, 'card.x', 0.5, 99)).toBe(5);
  expect(resolveTrackValue(model.timeline, 'card.x', 2, 99)).toBe(10);
  expect(resolveTrackValue(model.timeline, 'disabled-track', 0.5, 99)).toBe(99);
  expect(resolveTrackValue(model.timeline, 'missing', 0.5, 99)).toBe(99);

  expect(resolveLayerState(model.layers, model.clips, model.timeline, 'card', 0.5)).toMatchObject({
    active: true,
    clipProgress: 0.5,
    localTime: 0.5,
    x: 5,
  });
  expect(resolveLayerState([], [], model.timeline, 'missing', 0)).toMatchObject({
    active: true,
    id: 'missing',
  });
});

it('samples an enabled two-axis motion path and rejects unrelated tracks', () => {
  const model = createRuntimeModel(true);
  const xTrack = model.timeline.tracks.find(({ id }) => id === 'card.x')!;
  const unrelated = model.timeline.tracks.find(({ id }) => id === 'disabled-track')!;

  expect(sampleRuntimeMotionPathTrackValue(model.timeline, xTrack, 0.5)).toBe(5);
  expect(sampleRuntimeMotionPathTrackValue(model.timeline, xTrack, 0.75)).toBe(8.4375);
  expect(sampleRuntimeMotionPathTrackValue(model.timeline, unrelated, 0.5)).toBeNull();
});

function createRuntimeModel(withMotionPath = false) {
  const document = createDocument([]);
  document.scenes = [
    { duration: 2, id: 'main', start: 0 },
    { duration: 2, enabled: false, id: 'disabled', start: 0 },
  ];
  document.layers = [{ id: 'card', type: 'customDraw', visible: true, x: 2, y: 3 }];
  document.clips = [{ duration: 1, layerId: 'card', sceneId: 'main', start: 0 }];
  document.timeline = createTimeline(withMotionPath);
  const scenes = normalizeScenes(document.scenes, document.duration);
  return {
    clips: normalizeClips(document.clips, document.duration),
    layers: normalizeLayers(document.layers),
    scenes,
    timeline: normalizeTimeline(document.timeline, document.duration, scenes),
  };
}

function createTimeline(withMotionPath: boolean) {
  return {
    ...(withMotionPath
      ? {
          motionPaths: [
            {
              layerId: 'card',
              points: [
                { kind: 'linear' as const, xKeyframeId: 'x0', yKeyframeId: 'y0' },
                { kind: 'linear' as const, xKeyframeId: 'x1', yKeyframeId: 'y1' },
              ],
            },
          ],
        }
      : {}),
    phases: [{ duration: 1, id: 'phase', sceneId: 'main', start: 0 }],
    tracks: [
      createTrack('card.x', 'x', ['x0', 'x1'], [0, 10]),
      createTrack('card.y', 'y', ['y0', 'y1'], [0, 10]),
      { ...createTrack('disabled-track', 'opacity', ['o0', 'o1'], [0, 1]), enabled: false },
    ],
  };
}

function createTrack(id: string, property: string, ids: string[], values: number[]) {
  return {
    id,
    keyframes: [
      { id: ids[0]!, time: 0, value: values[0]! },
      { id: ids[1]!, time: 1, value: values[1]! },
    ],
    layerId: 'card',
    phaseId: 'phase',
    property,
  };
}
