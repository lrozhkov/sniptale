import { describe, expect, it } from 'vitest';
import {
  resolveVideoCompositionActions,
  resolveVideoCompositionActionSourceMapping,
} from './actions';
import { resolveVideoCompositionFrame } from './index';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectFromRecording,
} from '../../../project/factories/creation';
import { createVideoClipFromAsset } from '../../../project/factories/clip';
import type { VideoProjectActionEvent } from '../../../project/types';
import { patchReviewClicks } from '../../../review/advanced/click-animation';
import { normalizeVideoProjectCursorSkin } from '../../../project/cursor';

function manualEvent(): VideoProjectActionEvent {
  return {
    id: 'manual',
    anchor: { kind: 'project', time: 1 },
    kind: 'CLICK',
    label: 'Click',
    point: { x: 120, y: 160 },
    data: {},
  };
}

function capturedProject() {
  const project = createEmptyVideoProject('Source actions', 1000, 800);
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'recording', recordingId: 'source' },
    {
      width: 1000,
      height: 800,
      duration: 4,
      hasAudio: false,
      audioPeaks: null,
      mimeType: 'video/mp4',
      size: 10,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 1000, 800, 0);
  if (clip.type !== 'VIDEO') throw new Error('Expected video');
  clip.sourceInstanceId = 'placement';
  project.assets = [asset];
  project.clips = [clip];
  project.duration = 4;
  project.actionEvents = [
    {
      id: 'captured',
      kind: 'CLICK',
      data: {},
      label: 'Click',
      point: { x: 0.4, y: 0.6 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'source',
        sourceInstanceId: 'placement',
        sourceEventId: 'raw',
        sourceTime: 2.1,
      },
      presentation: { offset: -0.3, duration: 1 },
    },
  ];
  return { project, clip };
}

describe('composition action admission', () => {
  it('uses effective presentation duration, clipped progress and half-open end for a manual action', () => {
    const project = createEmptyVideoProject('Offset');
    project.duration = 3;
    project.actionEvents = [
      {
        ...manualEvent(),
        anchor: { kind: 'project', time: 0.2 },
        presentation: { offset: -0.5, duration: 1 },
      },
    ];
    expect(resolveVideoCompositionActions(project, 0)[0]?.progress).toBeCloseTo(0.3);
    expect(resolveVideoCompositionActions(project, 0.69)).toHaveLength(1);
    expect(resolveVideoCompositionActions(project, 0.7)).toEqual([]);
    expect(project.actionEvents[0]?.anchor).toEqual({ kind: 'project', time: 0.2 });
  });

  it('honors project defaults, event overrides and disabling independently of row visibility', () => {
    const project = createEmptyVideoProject('Presentation');
    project.duration = 3;
    project.actionEvents = [manualEvent()];
    project.utilityLanes = {
      actions: { visible: false, locked: false },
      camera: { visible: true, locked: false },
    };
    expect(resolveVideoCompositionActions(project, 1.2)[0]?.duration).toBe(0.7);
    project.actionEvents[0]!.presentation = { duration: 1.4 };
    expect(resolveVideoCompositionActions(project, 1.2)[0]?.duration).toBe(1.4);
    project.actionEvents[0]!.presentation = { enabled: false };
    expect(resolveVideoCompositionActions(project, 1.2)).toEqual([]);
  });

  it('routes captured accents only into their source layer and manual accents into the scene pass', () => {
    const { project, clip } = capturedProject();
    project.actionEvents.push({ ...manualEvent(), anchor: { kind: 'project', time: 2 } });
    const frame = resolveVideoCompositionFrame(project, 2.2);
    expect(frame.actions.map((action) => action.event.id)).toEqual(['manual']);
    const layer = frame.visualLayers.find((item) => item.clipId === clip.id);
    expect(layer?.kind).toBe('video');
    if (layer?.kind !== 'video') throw new Error('Expected video layer');
    expect(layer.actions?.map((action) => action.event.id)).toEqual(['captured']);
    expect(layer.actions?.[0]?.point).toEqual({ x: 0.4, y: 0.6 });
  });

  it('keeps progress across a no-op split, including pre-offset pixels in the preceding fragment', () => {
    const { project, clip } = capturedProject();
    const before = resolveVideoCompositionActions(project, 1.9)[0]!;
    project.clips = [
      { ...clip, duration: 2, sourceDuration: 2 },
      { ...clip, id: 'right', startTime: 2, duration: 2, sourceStart: 2, sourceDuration: 2 },
    ];
    const prefix = resolveVideoCompositionActions(project, 1.9)[0]!;
    expect(prefix.progress).toBeCloseTo(before.progress);
    expect(prefix.clipId).toBe(clip.id);
    expect(prefix.occurrence.clipId).toBe('right');
    expect(resolveVideoCompositionActions(project, 2)[0]?.clipId).toBe('right');
    expect(resolveVideoCompositionActions(project, 2)[0]?.progress).toBeCloseTo(0.2);
    expect(project.actionEvents).toHaveLength(1);
    expect(project.actionEvents[0]?.anchor).toMatchObject({ sourceTime: 2.1 });
  });

  it('never paints before source admission or across a gap', () => {
    const { project, clip } = capturedProject();
    project.clips = [
      { ...clip, duration: 2, sourceDuration: 2 },
      { ...clip, id: 'right', startTime: 3, duration: 2, sourceStart: 2, sourceDuration: 2 },
    ];
    project.duration = 5;
    expect(resolveVideoCompositionActions(project, 2.9)).toEqual([]);
    expect(resolveVideoCompositionActions(project, 3)[0]?.progress).toBeCloseTo(0.2);
    project.clips = [{ ...clip, duration: 2, sourceDuration: 2 }];
    expect(resolveVideoCompositionActions(project, 1.9)).toEqual([]);
  });
});

it('projects authored visual settings consistently on seek and validates the source mapping', () => {
  const { project, clip } = capturedProject();
  const clickStyle = { color: '#12abef', size: 64, opacity: 0.6, strokeWidth: 4 };
  project.actionEvents[0]!.presentation = {
    ...project.actionEvents[0]!.presentation,
    clickStyle,
    easing: 'LINEAR',
  };
  const first = resolveVideoCompositionActions(project, 2.2)[0]!;
  expect(first.clickStyle).toEqual(clickStyle);
  expect(first.easing).toBe('LINEAR');
  resolveVideoCompositionActions(project, 3.5);
  expect(resolveVideoCompositionActions(project, 2.2)[0]).toEqual(first);
  expect(resolveVideoCompositionActionSourceMapping(project, first.occurrence, 2.2)).toMatchObject({
    frame: clip.transform,
    sourceWidth: 1000,
    sourceHeight: 800,
  });
  expect(
    resolveVideoCompositionActionSourceMapping(
      project,
      { ...first.occurrence, event: manualEvent() },
      2.2
    )
  ).toBeNull();
  expect(
    resolveVideoCompositionActionSourceMapping(
      project,
      { ...first.occurrence, clipId: 'missing' },
      2.2
    )
  ).toBeNull();
  project.assets = [];
  expect(resolveVideoCompositionActionSourceMapping(project, first.occurrence, 2.2)).toBeNull();
});
it.each(['halo', 'path', 'area'] as const)(
  'held source feedback paints one physical appearance (%s)',
  (gestureAppearance) => {
    const project = createVideoProjectFromRecording({
      recordingId: 'held',
      filename: 'held.webm',
      width: 100,
      height: 100,
      duration: 4,
      mimeType: 'video/webm',
      size: 10,
      cursorTrack: {
        captureMode: 'embedded-fallback',
        skin: normalizeVideoProjectCursorSkin(undefined),
        samples: [1, 2, 3].map((time) => ({
          id: `held-${time}`,
          time,
          x: 20,
          y: 30,
          visible: true,
          captureSegment: 0,
          recordingPoint: { x: 0.2, y: 0.3 },
        })),
      },
      sourceNormalizedActionEvents: [
        {
          id: 'hold',
          kind: 'CLICK',
          time: 1,
          duration: 0.6,
          point: { x: 0.2, y: 0.3 },
          label: 'Hold',
          preset: 'NONE',
          data: {
            gestureId: 'hold',
            gestureType: 'hold',
            downTime: 1,
            upTime: 3,
            button: 0,
            completion: 'released',
            captureSegment: 0,
          },
        },
      ],
    });
    const group = project.actionFeedback![0]!;
    group.gestureStyles = patchReviewClicks([], ['hold'], {
      effect: 'press',
      gestureAppearance,
      gestureArea: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    });
    const original = structuredClone(project.actionEvents);
    const states = resolveVideoCompositionActions(project, 1.5);
    expect(states).toHaveLength(1);
    expect(states[0]!.gestureFeedback).toMatchObject({
      effect: 'press',
      point: { x: 0.2, y: 0.3 },
    });
    expect(states[0]!.gestureFeedback!.path !== undefined).toBe(gestureAppearance === 'path');
    expect(states[0]!.gestureFeedback!.area !== undefined).toBe(gestureAppearance === 'area');
    expect(states[0]!.event.id).toBe(project.actionEvents[0]!.id);
    expect(resolveVideoCompositionActions(project, 0.5)).toEqual([]);
    expect(project.actionEvents).toEqual(original);
    project.actionEvents = [];
    expect(resolveVideoCompositionActions(project, 1.5)).toEqual([]);
  }
);

it('evaluates a partial rate-two camera position and its circle crop at project time', async () => {
  const { project, clip } = capturedProject();
  project.tracks[0]!.role = 'CAMERA';
  clip.transform = { x: 20, y: 20, width: 80, height: 40, rotation: 0, opacity: 1 };
  clip.sourceStart = 1;
  clip.sourceDuration = 3;
  clip.playbackRate = 2;
  clip.duration = 1.5;
  project.duration = 1.5;
  clip.cameraAppearance = { shape: 'circle', roundness: 61, zoom: 1, panX: 0, panY: 0 };
  clip.cameraPositions = [
    {
      id: 'move',
      sourceTime: 2,
      crop: { zoom: 2, panX: 0.4, panY: -0.2 },
      transform: { ...clip.transform, x: 100, width: 160, height: 80 },
      fitMode: 'CONTAIN',
      transition: { kind: 'smooth', duration: 1 },
    },
  ];
  const occurrence = resolveVideoCompositionActions(project, 0.75)[0]?.occurrence;
  if (!occurrence) throw new Error('Missing camera action');
  const mapping = resolveVideoCompositionActionSourceMapping(project, occurrence, 0.75);
  expect(mapping).toMatchObject({
    frame: { x: 60, y: 20, width: 120, height: 60 },
    fitMode: 'COVER',
    cameraAppearance: { ...clip.cameraAppearance, zoom: 1.5, panX: 0.2, panY: -0.1 },
  });
  if (!mapping) throw new Error('Expected source mapping');
  const { mapSourceNormalizedPointToVisualLayer, mapVisualLayerPointToSourceNormalized } =
    await import('../../draw/fitted-media');
  const point = mapSourceNormalizedPointToVisualLayer({ ...mapping, point: { x: 0.5, y: 0.5 } });
  expect(point?.x).toBeCloseTo(114.75, 8);
  expect(point?.y).toBeCloseTo(51.5, 8);
  if (!point) throw new Error('Expected visible source point');
  const source = mapVisualLayerPointToSourceNormalized({ ...mapping, point });
  expect(source?.x).toBeCloseTo(0.5, 8);
  expect(source?.y).toBeCloseTo(0.5, 8);
  expect(clip.transform).toEqual({ x: 20, y: 20, width: 80, height: 40, rotation: 0, opacity: 1 });
  expect(clip.sourceStart).toBe(1);
  expect(clip.playbackRate).toBe(2);
});

it('removes captured camera source editing while hidden and restores it at the source endpoint', () => {
  const { project, clip } = capturedProject();
  project.tracks = project.tracks.map((track) => ({ ...track, role: 'CAMERA' }));
  clip.cameraHiddenRanges = [{ id: 'hidden', start: 2, end: 2.5 }];
  const occurrence = resolveVideoCompositionActions(project, 2.2)[0]!.occurrence;
  expect(resolveVideoCompositionActionSourceMapping(project, occurrence, 1.99)).not.toBeNull();
  expect(resolveVideoCompositionActionSourceMapping(project, occurrence, 2)).toBeNull();
  expect(resolveVideoCompositionActionSourceMapping(project, occurrence, 2.4999)).toBeNull();
  expect(resolveVideoCompositionActionSourceMapping(project, occurrence, 2.5)).not.toBeNull();
  project.actionEvents.push({ ...manualEvent(), anchor: { kind: 'project', time: 2 } });
  const frame = resolveVideoCompositionFrame(project, 2.2);
  expect(frame.visualLayers).toEqual([]);
  expect(frame.actions.map((action) => action.event.id)).toEqual(['manual']);
  project.tracks = project.tracks.map(({ role: _role, ...track }) => track);
  expect(resolveVideoCompositionActionSourceMapping(project, occurrence, 2.2)).not.toBeNull();
});
