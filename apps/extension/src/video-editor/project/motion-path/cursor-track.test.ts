import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion/index';
import type { VideoObjectTrack } from '../../../features/video/project/object-tracks';
import { createGeneratedMotionPathFromCursorTrack } from './cursor-track';

it('builds camera motion path stops from a hidden camera cursor track', () => {
  const project = createEmptyVideoProject('Cursor path');
  const region = createVideoProjectMotionRegion(project, 0);
  const path = createGeneratedMotionPathFromCursorTrack({
    project,
    region,
    track: createCameraCursorTrack(),
  });

  expect(path.stops).toEqual([
    expect.objectContaining({ offset: 0, target: expect.objectContaining({ x: 120, y: 90 }) }),
    expect.objectContaining({ offset: 0.5, target: expect.objectContaining({ x: 340, y: 180 }) }),
    expect.objectContaining({ offset: 1, target: expect.objectContaining({ x: 560, y: 320 }) }),
  ]);
});

it('ignores visible object tracks that are not the hidden camera cursor source', () => {
  const project = createEmptyVideoProject('Visible object track');
  const region = createVideoProjectMotionRegion(project, 0);
  const path = createGeneratedMotionPathFromCursorTrack({
    project,
    region,
    track: createVisibleObjectTrack(),
  });

  expect(path.stops).toHaveLength(2);
});

function createCameraCursorTrack(): VideoObjectTrack {
  return {
    hidden: true,
    id: 'visual-cursor',
    kind: 'visualCursor',
    role: 'cameraCursor',
    samples: [
      { confidence: 0.9, time: 0, visible: true, x: 120, y: 90 },
      { confidence: 0.9, time: 1, visible: true, x: 340, y: 180 },
      { confidence: 0, time: 2, visible: false, x: 600, y: 300 },
      { confidence: 0.9, time: 3, visible: true, x: 560, y: 320 },
    ],
    source: 'visualDetection',
  };
}

function createVisibleObjectTrack(): VideoObjectTrack {
  return {
    id: 'manual-object',
    kind: 'object',
    samples: [
      { confidence: 1, time: 0, visible: true, x: 120, y: 90 },
      { confidence: 1, time: 1, visible: true, x: 340, y: 180 },
    ],
    source: 'manual',
  };
}
