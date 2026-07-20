import { createAnnotationClip, createShapeClip, createTextClip } from '../factories/overlay-clip';
import { createEmptyVideoProject, createVideoProjectAsset } from '../factories/creation';
import { createVideoClipFromAsset } from '../factories/clip';
import { createVideoProjectCursorTrack } from '../defaults';
import { createVideoProjectMotionRegion } from '../motion/index';
import {
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoProjectAssetType,
  VideoProjectShapeType,
  type VideoProjectActionEvent,
  type VideoProjectAsset,
} from '../types/index';

export function createAsset(): VideoProjectAsset {
  return createVideoProjectAsset(
    'Asset',
    VideoProjectAssetType.VIDEO,
    {
      kind: 'project-asset',
      projectAssetId: 'project-asset-1',
    },
    {
      audioPeaks: null,
      duration: 5,
      hasAudio: true,
      height: 720,
      mimeType: 'video/webm',
      size: 1024,
      width: 1280,
    }
  );
}

export function createActionEvent(): VideoProjectActionEvent {
  return {
    data: { button: 'primary' },
    duration: 0.2,
    id: 'action-1',
    kind: VideoProjectActionEventKind.CLICK,
    label: 'Click',
    point: { x: 100, y: 120 },
    preset: VideoProjectActionPreset.CLICK_RIPPLE,
    time: 1,
  };
}

export function createProject() {
  const project = createEmptyVideoProject('Domain Boundary', 1280, 720);
  const asset = createAsset();
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 1280, 720);
  const annotationClip = createAnnotationClip(project.tracks[2]!.id, 1280, 720, 1);
  const actionEvent = createActionEvent();

  return {
    ...project,
    actionEvents: [actionEvent],
    assets: [asset],
    clips: [clip, annotationClip],
    cursorTrack: createVideoProjectCursorTrack(),
    duration: clip.duration,
    motionRegions: [
      {
        ...createVideoProjectMotionRegion(project, 1),
        targetActionEventId: actionEvent.id,
      },
    ],
  };
}

export function createTextProject() {
  const project = createEmptyVideoProject('Text Domain Boundary', 1280, 720);
  return {
    ...project,
    clips: [createTextClip(project.tracks[2]!.id, 1280, 720, 0)],
  };
}

export function createShapeProject() {
  const project = createEmptyVideoProject('Shape Domain Boundary', 1280, 720);
  const asset = createAsset();
  const shapeClip = createShapeClip(
    project.tracks[2]!.id,
    1280,
    720,
    0,
    VideoProjectShapeType.RECTANGLE
  );

  return {
    ...project,
    assets: [asset],
    clips: [shapeClip],
  };
}
