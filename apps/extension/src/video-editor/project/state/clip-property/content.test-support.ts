import { createAnnotationClip } from '../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProject,
} from '../../../../features/video/project/types';

function createProjectAssets(): VideoProject['assets'] {
  return [
    {
      id: 'asset-1',
      type: 'VIDEO',
      name: 'Asset 1',
      source: { kind: 'project-asset', projectAssetId: 'asset-1' },
      createdAt: 1,
      metadata: {
        width: 1920,
        height: 1080,
        duration: 6,
        mimeType: 'video/mp4',
        size: 100,
        hasAudio: true,
        audioPeaks: null,
      },
    },
    {
      id: 'asset-2',
      type: 'IMAGE',
      name: 'Asset 2',
      source: { kind: 'project-asset', projectAssetId: 'asset-2' },
      createdAt: 2,
      metadata: {
        width: 1200,
        height: 800,
        duration: null,
        mimeType: 'image/png',
        size: 50,
        hasAudio: false,
        audioPeaks: null,
      },
    },
  ] as VideoProject['assets'];
}

function createVideoClip(trackId: string) {
  return {
    id: 'clip-video',
    trackId,
    type: VideoProjectClipType.VIDEO,
    name: 'Video',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 0,
    duration: 6,
    muted: false,
    volume: 1,
    audioGainStart: 1,
    audioGainEnd: 1,
    volumeEnvelopeStart: 1,
    volumeEnvelopeEnd: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { x: 0, y: 0, width: 1920, height: 1080, rotation: 0, opacity: 1 },
    assetId: 'asset-1',
    fitMode: VideoMediaFitMode.CONTAIN,
    fitScalePercent: 100,
    playbackRate: 1,
    sourceStart: 0,
    sourceDuration: 6,
  };
}

function createImageClip(trackId: string) {
  return {
    id: 'clip-image',
    trackId,
    type: VideoProjectClipType.IMAGE,
    name: 'Image',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 6,
    duration: 3,
    muted: true,
    volume: 1,
    audioGainStart: 1,
    audioGainEnd: 1,
    volumeEnvelopeStart: 1,
    volumeEnvelopeEnd: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { x: 120, y: 40, width: 960, height: 640, rotation: 0, opacity: 1 },
    assetId: 'asset-2',
    fitMode: VideoMediaFitMode.CONTAIN,
    fitScalePercent: 100,
  };
}

function createTextClip(trackId: string) {
  return {
    id: 'clip-text',
    trackId,
    type: VideoProjectClipType.TEXT,
    name: 'Text',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 1,
    duration: 2,
    muted: true,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: { x: 0, y: 0, width: 100, height: 40, rotation: 0, opacity: 1 },
    text: 'Hello',
    style: {
      fontSize: 32,
      fontFamily: 'Arial',
      fontWeight: 400,
      color: '#fff',
      backgroundColor: 'transparent',
      borderColor: '#000',
      borderWidth: 0,
      padding: 0,
      borderRadius: 0,
      lineHeight: 1.4,
      textAlign: 'left' as const,
    },
  };
}

function createProjectClips(project: VideoProject): VideoProject['clips'] {
  const [primaryTrack, , overlayTrack] = project.tracks;

  return [
    createVideoClip(primaryTrack!.id),
    createImageClip(primaryTrack!.id),
    createAnnotationClip(overlayTrack!.id, project.width, project.height, 0.5),
    createTextClip(overlayTrack!.id),
  ];
}

export function createProjectWithMediaTrack(): VideoProject {
  const project = createEmptyVideoProject('Fit');
  project.assets = createProjectAssets();
  project.clips = createProjectClips(project);
  return project;
}

export function getAnnotationClipId(project: VideoProject | null): string {
  const annotationClipId =
    project?.clips.find((item) => item.type === VideoProjectClipType.ANNOTATION)?.id ?? null;
  if (!annotationClipId) {
    throw new Error('Expected annotation clip fixture');
  }
  return annotationClipId;
}
