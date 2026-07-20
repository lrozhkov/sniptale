import { createEmptyVideoProject, createVideoProjectAsset } from '../../project/factories/creation';
import { createVideoClipFromAsset } from '../../project/factories/clip';
import { createVideoProjectCursorTrack } from '../../project/defaults';
import { syncProjectDuration } from '../../project/timeline';
import { syncProjectTransitions } from '../../project/transition/project';
import {
  VideoCursorCaptureMode,
  VideoMotionFocusMode,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoProjectAssetType,
  VideoTemporalEasing,
  VideoTransitionEasing,
  VideoTransitionKind,
  type VideoProject,
} from '../../project/types/index';

function createLaneImageAsset(id: string) {
  return createVideoProjectAsset(
    `Asset ${id}`,
    VideoProjectAssetType.IMAGE,
    { kind: 'project-asset', projectAssetId: id },
    {
      audioPeaks: null,
      duration: null,
      hasAudio: false,
      height: 720,
      mimeType: 'image/png',
      size: 100,
      width: 1280,
    }
  );
}

function createLaneClips(trackId: string) {
  const firstAsset = createLaneImageAsset('asset-1');
  const secondAsset = createLaneImageAsset('asset-2');
  const firstClip = createVideoClipFromAsset(trackId, firstAsset, 1280, 720, 0);
  const secondClip = createVideoClipFromAsset(trackId, secondAsset, 1280, 720, 4);

  firstClip.id = 'clip-a';
  firstClip.duration = 5;
  secondClip.id = 'clip-b';
  secondClip.duration = 5;

  return {
    assets: [firstAsset, secondAsset],
    clips: [firstClip, secondClip],
  };
}

function createLaneTemporalOwners() {
  return {
    actionEvents: [
      {
        data: {},
        duration: 0,
        id: 'action-1',
        kind: VideoProjectActionEventKind.CLICK,
        label: 'Click',
        point: { x: 110, y: 160 },
        preset: VideoProjectActionPreset.CLICK_RIPPLE,
        time: 3,
      },
    ],
    cursorTrack: {
      ...createVideoProjectCursorTrack(VideoCursorCaptureMode.SEPARATE),
      samples: [
        { id: 'cursor-1', time: 4, visible: true, x: 100, y: 150 },
        { id: 'cursor-2', time: 5, visible: false, x: 200, y: 250 },
      ],
    },
    motionRegions: [
      {
        duration: 1.8,
        easing: VideoTemporalEasing.EASE_IN_OUT,
        focusMode: VideoMotionFocusMode.MANUAL,
        focusPoint: { x: 320, y: 180 },
        id: 'motion-1',
        scale: 1.8,
        startTime: 2.5,
        targetActionEventId: null,
        zoomInDuration: 0.3,
        zoomOutDuration: 0.4,
      },
    ],
    transitions: [
      {
        duration: 1,
        easing: VideoTransitionEasing.LINEAR,
        id: 'transition-1',
        kind: VideoTransitionKind.CROSSFADE,
        leadingClipId: 'clip-a',
        trailingClipId: 'clip-b',
      },
    ],
  };
}

export function createLaneProject(): VideoProject {
  const project = createEmptyVideoProject('Lane test', 1280, 720);
  const trackId = project.tracks[0]!.id;
  const laneClips = createLaneClips(trackId);
  const laneTemporalOwners = createLaneTemporalOwners();

  return syncProjectDuration(
    syncProjectTransitions({
      ...project,
      assets: laneClips.assets,
      clips: laneClips.clips,
      ...laneTemporalOwners,
    })
  );
}

export function createMergedCursorProject(): VideoProject {
  const project = createLaneProject();
  const cursorTrack = project.cursorTrack!;

  cursorTrack.samples = [
    {
      id: 'cursor-1',
      interpolation: VideoTemporalEasing.LINEAR,
      time: 1,
      visible: true,
      x: 0,
      y: 0,
    },
    {
      id: 'cursor-2',
      interpolation: VideoTemporalEasing.LINEAR,
      time: 2,
      visible: true,
      x: 50,
      y: 50,
    },
    {
      id: 'cursor-3',
      interpolation: VideoTemporalEasing.LINEAR,
      time: 3,
      visible: true,
      x: 100,
      y: 100,
    },
    {
      id: 'cursor-4',
      interpolation: VideoTemporalEasing.LINEAR,
      time: 4,
      visible: false,
      x: 100,
      y: 100,
    },
  ];

  return project;
}
