import { expect, it } from 'vitest';
import {
  createAnnotationClip,
  createShapeClip,
  createSubtitleClip,
  createTextClip,
} from '../../../project/factories/overlay-clip';
import {
  createAudioClipFromAsset,
  createVideoClipFromAsset,
} from '../../../project/factories/clip';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../project/factories/creation';
import { getSortedTracks } from '../../../project/timeline';
import {
  VideoProjectAssetType,
  VideoProjectShapeType,
  VideoTrackKind,
  VideoProjectTrackRole,
  VideoMotionOverlayZoomMode,
} from '../../../project/types/index';
import { resolveVideoCompositionFrame } from './index';
import { shouldLockVisualLayerToViewport } from '../../motion/layer-camera';
import { resolveVideoCompositionEffectInputLayers } from './layers';
import type { EffectRuntimeFramePlan } from '../../effect-runtime/runtime/types';

function createInputPlan(target: EffectRuntimeFramePlan['target']): EffectRuntimeFramePlan {
  return {
    assets: [],
    controls: {},
    dimensions: { width: 1280, height: 720 },
    documentSha256: 'test-document',
    documentSource: '',
    duration: 4,
    effectInstanceId: 'input-effect',
    fps: 30,
    frameIndex: 30,
    kind: target.kind === 'transition' ? 'transition' : 'targetEffect',
    progress: 0.25,
    renderDimensions: { width: 1280, height: 720 },
    snapshotId: 'snapshot',
    target,
    time: 1,
  };
}

it('retains camera coordinates for effect inputs including transparent transition endpoints', () => {
  const project = createEmptyVideoProject();
  const asset = createMediaAsset('camera', 'Camera', VideoProjectAssetType.VIDEO, 4, false);
  const screenTrack = project.tracks[0]!;
  const cameraTrack = {
    ...screenTrack,
    id: 'camera-track',
    order: 0.5,
    role: VideoProjectTrackRole.CAMERA,
  };
  const screen = createVideoClipFromAsset(screenTrack.id, asset, 1280, 720, 0);
  const camera = createVideoClipFromAsset(cameraTrack.id, asset, 1280, 720, 0);
  camera.transform.opacity = 0;
  project.tracks.push(cameraTrack);
  project.assets = [asset];
  project.clips = [screen, camera];
  const plan = createInputPlan({
    kind: 'transition',
    leadingClipId: screen.id,
    trailingClipId: camera.id,
    transitionId: 'transition',
  });
  const layers = resolveVideoCompositionEffectInputLayers(project, 1, [plan]);
  expect(layers.map((layer) => layer.clipId)).toEqual([screen.id, camera.id]);
  expect(layers[1]).toMatchObject({ trackRole: VideoProjectTrackRole.CAMERA, opacity: 0 });
  const zoom = { ...resolveVideoCompositionFrame(project, 1).camera, scale: 2 };
  expect(shouldLockVisualLayerToViewport(layers[0]!, zoom)).toBe(false);
  expect(shouldLockVisualLayerToViewport(layers[1]!, zoom)).toBe(true);
  expect(resolveVideoCompositionEffectInputLayers(project, 5, [plan])).toEqual([]);
  cameraTrack.visible = false;
  expect(
    resolveVideoCompositionEffectInputLayers(project, 1, [plan]).map((layer) => layer.clipId)
  ).toEqual([screen.id]);
  cameraTrack.visible = true;
  const clipPlan = createInputPlan({
    kind: 'clip',
    clipId: camera.id,
    chainIndex: 0,
    placement: { width: 1280, height: 720, x: 0, y: 0, opacity: 1, rotation: 0 },
  });
  expect(
    resolveVideoCompositionEffectInputLayers(project, 1, [clipPlan]).map((layer) => layer.clipId)
  ).toEqual([camera.id]);
  expect(
    resolveVideoCompositionEffectInputLayers(project, 1, [
      createInputPlan({ kind: 'scene', clipId: 'scene-effect' }),
    ])
  ).toEqual([]);
});

it('keeps camera-role video in viewport space independently of the overlay zoom preference', () => {
  const project = createEmptyVideoProject();
  const asset = createMediaAsset('camera', 'Camera', VideoProjectAssetType.VIDEO, 4, false);
  const screenTrack = project.tracks[0]!;
  const cameraTrack: (typeof project.tracks)[number] = {
    ...screenTrack,
    id: 'camera-track',
    role: VideoProjectTrackRole.CAMERA,
  };
  project.tracks.push(cameraTrack);
  project.assets = [asset];
  project.clips = [
    createVideoClipFromAsset(screenTrack.id, asset, project.width, project.height, 0),
    createVideoClipFromAsset(cameraTrack.id, asset, project.width, project.height, 0),
  ];
  const frame = resolveVideoCompositionFrame(project, 1);
  const cameraLayer = frame.visualLayers.find((layer) => layer.clip.trackId === cameraTrack.id)!;
  const screenLayer = frame.visualLayers.find((layer) => layer.clip.trackId === screenTrack.id)!;
  for (const overlayZoomMode of Object.values(VideoMotionOverlayZoomMode)) {
    const zoom = { ...frame.camera, scale: 2, overlayZoomMode };
    expect(shouldLockVisualLayerToViewport(cameraLayer, zoom)).toBe(true);
    expect(shouldLockVisualLayerToViewport(screenLayer, zoom)).toBe(false);
  }
  delete cameraTrack.role;
  const moved = resolveVideoCompositionFrame(project, 1);
  expect(
    shouldLockVisualLayerToViewport(
      moved.visualLayers.find((layer) => layer.clip.trackId === cameraTrack.id)!,
      moved.camera
    )
  ).toBe(false);
});

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
    { kind: 'project-asset', projectAssetId: id },
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

function createLayerKindsAssets() {
  return {
    audioAsset: createMediaAsset('asset-audio', 'Audio', VideoProjectAssetType.AUDIO, 12, true),
    imageAsset: createMediaAsset('asset-image', 'Image', VideoProjectAssetType.IMAGE, null, false),
    videoAsset: createMediaAsset('asset-video', 'Video', VideoProjectAssetType.VIDEO, 12, true),
  };
}

function createLayerKindsClips(props: {
  audioAsset: ReturnType<typeof createMediaAsset>;
  audioTrackId: string;
  hiddenOverlayTrackId: string;
  imageAsset: ReturnType<typeof createMediaAsset>;
  overlayTrackId: string;
  primaryTrackId: string;
  videoAsset: ReturnType<typeof createMediaAsset>;
}) {
  const clips = [
    createVideoClipFromAsset(props.primaryTrackId, props.videoAsset, 1280, 720, 0),
    createVideoClipFromAsset(props.primaryTrackId, props.imageAsset, 1280, 720, 0.5),
    createVideoClipFromAsset(props.primaryTrackId, props.imageAsset, 1280, 720, 0.75),
    createAudioClipFromAsset(props.audioTrackId, props.audioAsset, 0),
    createTextClip(props.overlayTrackId, 1280, 720, 0),
    createAnnotationClip(props.overlayTrackId, 1280, 720, 0.25),
    createShapeClip(props.overlayTrackId, 1280, 720, 0.5, VideoProjectShapeType.RECTANGLE),
    createTextClip(props.overlayTrackId, 1280, 720, 20),
    createShapeClip(props.hiddenOverlayTrackId, 1280, 720, 0, VideoProjectShapeType.ELLIPSE),
  ] as const;

  return assignLayerKindsClipMetadata(clips);
}

function assignLayerKindsClipMetadata(
  clips: readonly [
    ReturnType<typeof createVideoClipFromAsset>,
    ReturnType<typeof createVideoClipFromAsset>,
    ReturnType<typeof createVideoClipFromAsset>,
    ReturnType<typeof createAudioClipFromAsset>,
    ReturnType<typeof createTextClip>,
    ReturnType<typeof createAnnotationClip>,
    ReturnType<typeof createShapeClip>,
    ReturnType<typeof createTextClip>,
    ReturnType<typeof createShapeClip>,
  ]
) {
  const [
    videoClip,
    imageClip,
    transparentImageClip,
    audioClip,
    textClip,
    annotationClip,
    shapeClip,
    inactiveTextClip,
    hiddenShapeClip,
  ] = clips;

  videoClip.id = 'video-visible';
  videoClip.duration = 8;
  imageClip.id = 'image-visible';
  transparentImageClip.id = 'image-transparent';
  transparentImageClip.transform.opacity = 0;
  audioClip.id = 'audio-non-visual';
  textClip.id = 'text-visible';
  annotationClip.id = 'annotation-visible';
  shapeClip.id = 'shape-visible';
  inactiveTextClip.id = 'text-inactive';
  hiddenShapeClip.id = 'shape-hidden-track';

  return [...clips];
}

function createLayerKindsFrame() {
  const project = createEmptyVideoProject('Layer kinds', 1280, 720);
  project.tracks.push(createVideoProjectTrack('Audio', 2, VideoTrackKind.AUDIO));
  project.tracks.push(createVideoProjectTrack('Overlay', 0, VideoTrackKind.PRIMARY));
  const hiddenOverlayTrackId = 'overlay-hidden';
  const subtitleTrack = createVideoProjectTrack('Subtitles', 3, VideoTrackKind.SUBTITLE);
  const assets = createLayerKindsAssets();
  const clips = createLayerKindsClips({
    ...assets,
    audioTrackId: project.tracks[1]?.id ?? '',
    hiddenOverlayTrackId,
    overlayTrackId: project.tracks[2]?.id ?? '',
    primaryTrackId: project.tracks[0]?.id ?? '',
  });

  return resolveVideoCompositionFrame(
    {
      ...project,
      assets: [assets.videoAsset, assets.imageAsset, assets.audioAsset],
      clips: [...clips, createSubtitleClip(subtitleTrack.id, 1280, 720, 0)],
      tracks: [
        ...project.tracks,
        subtitleTrack,
        {
          id: hiddenOverlayTrackId,
          isRoot: false,
          kind: project.tracks[2]?.kind ?? VideoTrackKind.PRIMARY,
          locked: false,
          name: 'Hidden overlay',
          order: 3,
          visible: false,
        },
      ],
    },
    1
  );
}

it('resolves only active visible visual layers across clip kinds', () => {
  const frame = createLayerKindsFrame();
  const annotationLayer = frame.visualLayers.find(
    (layer) => layer.kind === 'annotation' && layer.clipId === 'annotation-visible'
  );

  expect(frame.visualLayers).toEqual([
    expect.objectContaining({ kind: 'text', zIndex: 0 }),
    expect.objectContaining({ clipId: 'video-visible', kind: 'video', zIndex: 1 }),
    expect.objectContaining({ clipId: 'image-visible', kind: 'image', zIndex: 2 }),
    expect.objectContaining({ clipId: 'text-visible', kind: 'text', zIndex: 3 }),
    expect.objectContaining({ clipId: 'annotation-visible', kind: 'annotation', zIndex: 4 }),
    expect.objectContaining({ clipId: 'shape-visible', kind: 'shape', zIndex: 5 }),
  ]);
  expect(annotationLayer).toEqual(
    expect.objectContaining({
      clip: expect.objectContaining({ templateKind: 'LOWER_THIRD_BASIC' }),
      renderState: expect.objectContaining({
        blurAmount: 0,
        scaleX: 1,
        scaleY: 1,
      }),
    })
  );
});

it('resolves transition-driven render state for active clip overlaps', () => {
  const project = createEmptyVideoProject('Transition layers', 1280, 720);
  const trackId = project.tracks[0]?.id ?? '';
  const imageAsset = createMediaAsset(
    'asset-image',
    'Image',
    VideoProjectAssetType.IMAGE,
    null,
    false
  );
  const leadingClip = createVideoClipFromAsset(trackId, imageAsset, 1280, 720, 0);
  const trailingClip = createVideoClipFromAsset(trackId, imageAsset, 1280, 720, 3);

  leadingClip.id = 'clip-a';
  leadingClip.duration = 4;
  trailingClip.id = 'clip-b';
  trailingClip.duration = 4;

  const frame = resolveVideoCompositionFrame(
    {
      ...project,
      assets: [imageAsset],
      clips: [leadingClip, trailingClip],
      transitions: [
        {
          direction: 'LEFT',
          duration: 1,
          easing: 'LINEAR',
          id: 'transition-1',
          intensity: 'BALANCED',
          kind: 'PUSH',
          leadingClipId: 'clip-a',
          renderKind: 'COMPOSITE',
          templateKind: 'PUSH',
          trailingClipId: 'clip-b',
        },
      ],
    },
    3.5
  );

  const leadingLayer = frame.visualLayers.find((layer) => layer.clipId === 'clip-a');
  const trailingLayer = frame.visualLayers.find((layer) => layer.clipId === 'clip-b');

  expect(leadingLayer?.renderState.translateX).toBeLessThan(0);
  expect(trailingLayer?.renderState.translateX).toBeGreaterThan(0);
});

it('omits subtitle layers when subtitle rendering is disabled for the frame', () => {
  const project = createEmptyVideoProject('Subtitle options', 1280, 720);
  const subtitleTrack = createVideoProjectTrack('Subtitles', 3, VideoTrackKind.SUBTITLE);
  const frame = resolveVideoCompositionFrame(
    {
      ...project,
      clips: [createSubtitleClip(subtitleTrack.id, 1280, 720, 0)],
      tracks: [...project.tracks, subtitleTrack],
    },
    1,
    { includeSubtitles: false }
  );

  expect(frame.visualLayers).toEqual([]);
});

it('gives upper timeline tracks higher visual priority than lower tracks', () => {
  const project = createEmptyVideoProject('Track priority', 1280, 720);
  project.tracks.push(createVideoProjectTrack('Overlay', 0, VideoTrackKind.PRIMARY));
  const sortedTracks = getSortedTracks(project);
  const upperTrackId = sortedTracks.find((track) => track.name === 'Overlay')!.id;
  const lowerTrackId = sortedTracks.find((track) => track.isRoot)!.id;
  const imageAsset = createMediaAsset(
    'asset-priority',
    'Priority',
    VideoProjectAssetType.IMAGE,
    null,
    false
  );
  const upperClip = createVideoClipFromAsset(upperTrackId, imageAsset, 1280, 720, 0);
  const lowerClip = createVideoClipFromAsset(lowerTrackId, imageAsset, 1280, 720, 0);

  upperClip.id = 'upper-track-clip';
  lowerClip.id = 'lower-track-clip';

  const frame = resolveVideoCompositionFrame(
    {
      ...project,
      assets: [imageAsset],
      clips: [upperClip, lowerClip],
    },
    1
  );

  const upperLayer = frame.visualLayers.find((layer) => layer.clipId === upperClip.id);
  const lowerLayer = frame.visualLayers.find((layer) => layer.clipId === lowerClip.id);

  expect(upperLayer?.zIndex).toBeGreaterThan(lowerLayer?.zIndex ?? -1);
});

it('keeps exact actions on visible and isolated input layers across repeated source ranges', () => {
  const project = createEmptyVideoProject('Action input layers');
  const asset = createMediaAsset('source', 'Source', VideoProjectAssetType.VIDEO, 4, false);
  asset.source = { kind: 'recording', recordingId: 'recording' };
  const first = createVideoClipFromAsset(
    project.tracks[0]!.id,
    asset,
    project.width,
    project.height,
    0
  );
  if (first.type !== 'VIDEO') throw new Error('Expected source video');
  first.sourceInstanceId = 'instance';
  const upper = createVideoProjectTrack('Repeat', 1, VideoTrackKind.PRIMARY);
  const second = {
    ...first,
    id: 'repeat',
    trackId: upper.id,
    transform: { ...first.transform, x: 200, y: 100, width: 200, height: 120 },
  };
  project.tracks.push(upper);
  project.assets = [asset];
  project.clips = [first, second];
  project.duration = 4;
  project.actionEvents = [
    {
      id: 'fact',
      kind: 'CLICK',
      label: 'Click',
      data: {},
      point: { x: 0.25, y: 0.5 },
      anchor: {
        kind: 'recording-source',
        recordingId: 'recording',
        sourceInstanceId: 'instance',
        sourceEventId: 'raw',
        sourceTime: 1,
      },
    },
  ];
  const visible = resolveVideoCompositionFrame(project, 1.2);
  expect(visible.actions).toEqual([]);
  expect(
    visible.visualLayers.map((layer) => layer.kind === 'video' && layer.actions?.[0]?.clipId)
  ).toEqual([first.id, second.id]);
  const plan = createInputPlan({
    kind: 'clip',
    clipId: second.id,
    chainIndex: 0,
    placement: { ...second.transform },
  });
  const inputs = resolveVideoCompositionEffectInputLayers(project, 1.2, [plan]);
  expect(inputs).toHaveLength(1);
  expect(inputs[0]).toMatchObject({
    clipId: second.id,
    x: 200,
    y: 100,
    actions: [{ occurrence: { eventId: 'fact', clipId: second.id }, point: { x: 0.25, y: 0.5 } }],
  });
  upper.visible = false;
  expect(resolveVideoCompositionEffectInputLayers(project, 1.2, [plan])).toEqual([]);
});
