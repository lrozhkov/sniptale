import { expect, it } from 'vitest';
import { createVideoProjectFromRecording } from '../project/factories/creation';
import { resolveVideoProjectActionOccurrences } from '../project/action-occurrences';
import { REVIEW_CLICK_DEFAULT } from '../project/action-feedback/validation';
import {
  mapVideoActionOccurrencePointToScene,
  mapScenePointToVideoActionOccurrence,
} from './action-occurrence-geometry';

it('maps authored source click offsets through the actual crop and preserves capture coordinates', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'source',
    filename: 'source.webm',
    width: 160,
    height: 90,
    duration: 5,
    mimeType: 'video/webm',
    size: 100,
    sourceNormalizedActionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        time: 1,
        duration: 0.1,
        point: { x: 0.4, y: 0.6 },
        label: '',
        data: {},
        preset: 'NONE',
      },
    ],
  });
  project.actionFeedback![0]!.gestureStyles = [
    { ...REVIEW_CLICK_DEFAULT, id: 'click', effect: 'magnify', x: 0.1, y: -0.1 },
  ];
  project.actionEvents[0]!.presentation = { point: { x: 0.9, y: 0.9 } };
  const clip = project.clips[0]!;
  if (clip.type !== 'VIDEO') throw new Error('Expected source video');
  clip.transform = { ...clip.transform, x: 0, y: 0, width: 160, height: 90, rotation: 0 };
  clip.sourceCrop = { x: 0.25, y: 0, width: 0.5, height: 1 };
  const occurrence = resolveVideoProjectActionOccurrences(project)[0]!;
  const camera = {
    focusPoint: { x: 80, y: 45 },
    motionBlurAmount: 0,
    regionId: null,
    scale: 1,
    viewportWidth: 160,
    viewportHeight: 90,
    viewportX: 0,
    viewportY: 0,
  };
  const point = mapVideoActionOccurrencePointToScene(project, occurrence, 1, camera);
  expect(point).toEqual({ x: 80, y: 45 });
  const restored = mapScenePointToVideoActionOccurrence(project, occurrence, 1, camera, point!);
  expect(restored?.x).toBeCloseTo(0.5, 12);
  expect(restored?.y).toBeCloseTo(0.5, 12);
  expect(project.actionEvents[0]!.point).toEqual({ x: 0.4, y: 0.6 });
  expect(mapVideoActionOccurrencePointToScene(project, occurrence, 6, camera)).toBeNull();
  project.actionEvents[0]!.point = null;
  expect(
    mapVideoActionOccurrencePointToScene(
      project,
      resolveVideoProjectActionOccurrences(project)[0]!,
      1,
      camera
    )
  ).toBeNull();
});
