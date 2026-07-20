import { expect, it } from 'vitest';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoProjectClipType,
  VideoTimelinePlacementMode,
  VideoTrackKind,
  type VideoProject,
  type VideoProjectClip,
} from '../../../../features/video/project/types';
import { snapClipTransform, snapStagePoint } from './snap';

function createProject(clips: VideoProjectClip[] = []): VideoProject {
  return {
    actionEvents: [],
    assets: [],
    backgroundColor: '#000000',
    baseRecordingId: null,
    clips,
    createdAt: 0,
    cursorTrack: null,
    duration: 10,
    fps: 30,
    height: 720,
    id: 'project',
    name: 'Project',
    source: { kind: 'manual' },
    timelinePlacementMode: VideoTimelinePlacementMode.OVERWRITE,
    tracks: [
      {
        id: 'track-1',
        kind: VideoTrackKind.OVERLAY,
        locked: false,
        name: 'Track',
        order: 0,
        visible: true,
      },
    ],
    updatedAt: 0,
    version: 2,
    width: 1280,
  };
}

function createClip(id: string, x: number): VideoProjectClip {
  return {
    duration: 5,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id,
    linkMode: VideoClipLinkMode.DETACHED,
    muted: true,
    name: id,
    startTime: 0,
    style: {
      backgroundColor: '#000000',
      borderColor: '#000000',
      borderRadius: 0,
      borderWidth: 0,
      color: '#ffffff',
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: 400,
      lineHeight: 1.2,
      padding: 0,
      textAlign: 'left',
    },
    text: id,
    trackId: 'track-1',
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x, y: 50 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    type: VideoProjectClipType.TEXT,
    volume: 1,
  };
}

it('snaps moved clips to the grid when magnet is disabled', () => {
  const clip = createClip('clip-1', 0);
  const result = snapClipTransform({
    clip,
    mode: 'move',
    project: createProject([clip]),
    settings: {
      gridEnabled: true,
      gridSize: 50,
      gridSnapEnabled: true,
      magnetEnabled: false,
    },
    transform: { ...clip.transform, x: 76, y: 123 },
  });

  expect(result).toMatchObject({
    guides: [],
    transform: { x: 100, y: 100 },
  });
});

it('prefers magnet guides over grid candidates on the same axis', () => {
  const clip = createClip('clip-1', 0);
  const project = createProject([clip, createClip('clip-2', 305)]);
  const result = snapClipTransform({
    clip,
    mode: 'move',
    project,
    settings: {
      gridEnabled: true,
      gridSize: 50,
      gridSnapEnabled: true,
      magnetEnabled: true,
    },
    transform: { ...clip.transform, x: 202, y: 121 },
  });

  expect(result.transform.x).toBe(205);
  expect(result.transform.y).toBe(100);
  expect(result.guides).toEqual([{ axis: 'x', position: 305 }]);
});

it('uses rotated sibling visual bounds as magnet targets', () => {
  const clip = createClip('clip-1', 0);
  const sibling = createClip('clip-2', 305);
  sibling.transform.rotation = 45;
  const result = snapClipTransform({
    clip,
    mode: 'move',
    project: createProject([clip, sibling]),
    settings: {
      gridEnabled: false,
      gridSize: 50,
      gridSnapEnabled: false,
      magnetEnabled: true,
    },
    transform: { ...clip.transform, x: 181 },
  });

  expect(result.transform.x).toBeCloseTo(184.2893219, 6);
  expect(result.guides).toContainEqual({ axis: 'x', position: expect.closeTo(284.2893219, 6) });
});

it('snaps resized clip dimensions to the grid', () => {
  const clip = createClip('clip-1', 0);
  const result = snapClipTransform({
    clip,
    mode: 'resize',
    project: createProject([clip]),
    settings: {
      gridEnabled: true,
      gridSize: 25,
      gridSnapEnabled: true,
      magnetEnabled: false,
    },
    transform: { ...clip.transform, height: 139, width: 114, x: 11, y: 34 },
  });

  expect(result.transform).toMatchObject({
    height: 150,
    width: 125,
    x: 0,
    y: 25,
  });
});

it('snaps overlay points to scene guides', () => {
  const result = snapStagePoint({
    point: { x: 642, y: 358 },
    project: createProject(),
    settings: {
      gridEnabled: false,
      gridSize: 50,
      gridSnapEnabled: false,
      magnetEnabled: true,
    },
  });

  expect(result.point).toEqual({ x: 640, y: 360 });
  expect(result.guides).toEqual([
    { axis: 'x', position: 640 },
    { axis: 'y', position: 360 },
  ]);
});
