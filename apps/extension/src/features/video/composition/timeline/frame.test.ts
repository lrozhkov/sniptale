import { expect, it } from 'vitest';
import { createEmptyVideoProject, createVideoProjectAsset } from '../../project/factories/creation';
import { createVideoClipFromAsset } from '../../project/factories/clip';
import { createVideoProjectCursorTrack } from '../../project/defaults';
import {
  VideoMotionFocusMode,
  VideoClipTransitionKind,
  VideoCursorCaptureMode,
  type VideoProject,
  type VideoProjectActionEvent,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoProjectAssetType,
  VideoTemporalEasing,
} from '../../project/types/index';
import { getVideoCompositionActionDuration, resolveVideoCompositionFrame } from './frame/index';

function createImageAsset(id: string, name: string) {
  return createMediaAsset(id, name, VideoProjectAssetType.IMAGE, null, false);
}

function createMediaAsset(
  id: string,
  name: string,
  type: VideoProjectAssetType,
  duration: number | null,
  hasAudio: boolean
) {
  return createVideoProjectAsset(
    name,
    type,
    {
      kind: 'project-asset',
      projectAssetId: id,
    },
    {
      audioPeaks: null,
      duration,
      hasAudio,
      height: 720,
      mimeType:
        type === VideoProjectAssetType.IMAGE
          ? 'image/png'
          : type === VideoProjectAssetType.AUDIO
            ? 'audio/ogg'
            : 'video/webm',
      size: 100,
      width: 1280,
    }
  );
}

function createCompositionProject(): VideoProject {
  const project = createEmptyVideoProject('Composition test', 1280, 720);
  const trackId = project.tracks[0]?.id ?? '';
  const firstAsset = createImageAsset('asset-1', 'First');
  const secondAsset = createImageAsset('asset-2', 'Second');
  const firstClip = createVideoClipFromAsset(trackId, firstAsset, 1280, 720, 0);
  const secondClip = createVideoClipFromAsset(trackId, secondAsset, 1280, 720, 4);

  firstClip.id = 'clip-a';
  firstClip.duration = 5;
  firstClip.transitionOut = VideoClipTransitionKind.CROSSFADE;
  secondClip.id = 'clip-b';
  secondClip.duration = 5;
  secondClip.transitionIn = VideoClipTransitionKind.CROSSFADE;

  return {
    ...project,
    assets: [firstAsset, secondAsset],
    clips: [firstClip, secondClip],
    cursorTrack: {
      ...createVideoProjectCursorTrack(VideoCursorCaptureMode.SEPARATE),
      samples: [
        { id: 'cursor-1', time: 4, visible: true, x: 100, y: 150 },
        { id: 'cursor-2', time: 5, visible: true, x: 200, y: 250 },
      ],
    },
    actionEvents: [
      {
        id: 'action-1',
        kind: VideoProjectActionEventKind.PAUSE,
        time: 4.2,
        duration: 0,
        point: { x: 150, y: 200 },
        label: 'Zoom focus',
        data: {},
        preset: VideoProjectActionPreset.DWELL_ZOOM,
      },
    ],
  };
}

function expectCrossfadeFrame(frame: ReturnType<typeof resolveVideoCompositionFrame>) {
  const layersById = new Map(frame.visualLayers.map((layer) => [layer.clipId, layer]));

  expect(frame.visualLayers).toHaveLength(2);
  expect(layersById.get('clip-a')?.opacity).toBeCloseTo(0.5, 5);
  expect(layersById.get('clip-b')?.opacity).toBeCloseTo(0.5, 5);
  expect(frame.cursor).toEqual(
    expect.objectContaining({
      animationPreset: 'NONE',
      captureMode: VideoCursorCaptureMode.SEPARATE,
      preset: 'ARROW',
      scale: 1.28,
      x: 150,
      y: 200,
    })
  );
  expect(frame.actions).toEqual([expect.objectContaining({ point: { x: 150, y: 200 } })]);
  expect(frame.actions[0]?.progress).toBeCloseTo((4.5 - 4.2) / 1.3, 5);
}

it('resolves crossfaded layers with interpolated cursor and active actions', () => {
  expectCrossfadeFrame(resolveVideoCompositionFrame(createCompositionProject(), 4.5));
});

it('returns empty cursor state when the track is hidden and resolves preset durations', () => {
  const project = createCompositionProject();

  if (project.cursorTrack) {
    project.cursorTrack.skin.hidden = true;
  }

  const frame = resolveVideoCompositionFrame(project, 4.5);

  expect(frame.cursor).toBeNull();
  expect(getVideoCompositionActionDuration(project.actionEvents[0]!)).toBe(1.3);
  expect(
    getVideoCompositionActionDuration({
      ...project.actionEvents[0]!,
      duration: 0,
      kind: VideoProjectActionEventKind.CLICK,
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
    })
  ).toBe(0.7);
});

it('falls back to the last visible cursor sample and default NONE durations', () => {
  const project = createCompositionProject();

  project.cursorTrack = {
    ...createVideoProjectCursorTrack(VideoCursorCaptureMode.SEPARATE),
    samples: [{ id: 'cursor-last', time: 4.8, visible: true, x: 260, y: 320 }],
  };
  project.actionEvents = [
    {
      id: 'action-none',
      kind: VideoProjectActionEventKind.CLICK,
      time: 10,
      duration: 0,
      point: null,
      label: 'No animation',
      data: {},
      preset: VideoProjectActionPreset.NONE,
    },
  ] as VideoProjectActionEvent[];

  const frame = resolveVideoCompositionFrame(project, 5.2);

  expect(frame.cursor).toEqual(expect.objectContaining({ x: 260, y: 320 }));
  expect(frame.actions).toEqual([]);
  expect(getVideoCompositionActionDuration(project.actionEvents[0]!)).toBe(0.6);
  expect(
    getVideoCompositionActionDuration({
      ...project.actionEvents[0]!,
      kind: VideoProjectActionEventKind.PAUSE,
    })
  ).toBe(0.5);
});

it('suppresses cursor output when interpolation reaches a hidden sample', () => {
  const project = createCompositionProject();

  project.cursorTrack = {
    ...createVideoProjectCursorTrack(VideoCursorCaptureMode.SEPARATE),
    samples: [
      { id: 'cursor-1', time: 4, visible: true, x: 100, y: 150 },
      { id: 'cursor-2', time: 5, visible: false, x: 200, y: 250 },
    ],
  };

  expect(resolveVideoCompositionFrame(project, 4.5).cursor).toBeNull();
});

it('uses the latest embedded cursor sample without smoothing when raw video already contains the cursor', () => {
  const project = createCompositionProject();
  if (!project.cursorTrack) {
    throw new Error('Expected cursor track fixture');
  }

  project.cursorTrack.captureMode = VideoCursorCaptureMode.EMBEDDED_FALLBACK;
  project.cursorTrack.samples = [
    { id: 'cursor-1', time: 4, visible: true, x: 100, y: 150 },
    { id: 'cursor-2', time: 5, visible: true, x: 400, y: 500 },
  ];

  expect(resolveVideoCompositionFrame(project, 4.5).cursor).toEqual(
    expect.objectContaining({ x: 100, y: 150 })
  );
});

it('prefers a sample cursor override over the shared track appearance', () => {
  const project = createCompositionProject();
  if (!project.cursorTrack) {
    throw new Error('Expected cursor track fixture');
  }

  project.cursorTrack.skin = {
    animationPreset: 'NONE',
    color: '#111111',
    hidden: false,
    preset: 'ARROW',
    scale: 1,
    shadow: false,
  };
  project.cursorTrack.samples = [
    {
      id: 'cursor-1',
      skinOverride: {
        animationPreset: 'FLOAT',
        color: '#22cc88',
        hidden: false,
        preset: 'RING',
        scale: 1.6,
        shadow: true,
      },
      time: 4,
      visible: true,
      x: 100,
      y: 150,
    },
  ];

  expect(resolveVideoCompositionFrame(project, 4.2).cursor).toEqual(
    expect.objectContaining({
      animationPreset: 'FLOAT',
      color: '#22cc88',
      preset: 'RING',
      scale: 1.6 * 1.28,
      shadow: true,
    })
  );
});

it('applies cursor interpolation easing and resolves camera focus from motion regions', () => {
  const project = createCompositionProject();
  if (!project.cursorTrack) {
    throw new Error('Expected cursor track fixture');
  }

  project.cursorTrack.samples = [
    {
      id: 'cursor-1',
      interpolation: VideoTemporalEasing.EASE_OUT,
      time: 4,
      visible: true,
      x: 100,
      y: 150,
    },
    { id: 'cursor-2', time: 5, visible: true, x: 200, y: 250 },
  ];
  project.motionRegions = [
    {
      duration: 2,
      easing: VideoTemporalEasing.EASE_IN_OUT,
      focusMode: VideoMotionFocusMode.CURSOR,
      focusPoint: null,
      id: 'motion-1',
      scale: 2,
      startTime: 4,
      targetActionEventId: null,
      zoomInDuration: 0.5,
      zoomOutDuration: 0.5,
    },
  ];

  const frame = resolveVideoCompositionFrame(project, 4.5);

  expect(frame.cursor).toEqual(expect.objectContaining({ x: 175, y: 225 }));
  expect(frame.camera).toEqual(
    expect.objectContaining({
      regionId: 'motion-1',
      scale: 2,
      viewportX: 0,
      viewportY: 45,
      motionBlurAmount: 0,
    })
  );
});
