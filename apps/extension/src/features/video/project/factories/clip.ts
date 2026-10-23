import { windowHeaderGeometry, type WindowHeader } from '@sniptale/runtime-contracts/window-header';
import {
  decoratedMediaSourceSize,
  resolveDecoratedMediaFrame,
  resolveMediaFitFrame,
} from '../window-geometry';
import {
  DEFAULT_CLIP_FADE_MS,
  DEFAULT_CLIP_VOLUME,
  DEFAULT_IMAGE_CLIP_DURATION,
} from '../defaults';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoMediaShadowMode,
  type VideoProjectAsset,
  type VideoProjectAudioClip,
  VideoProjectAssetType,
  VideoProjectClipType,
  type VideoProjectImageClip,
  type VideoProjectTransform,
  type VideoProjectVideoClip,
} from '../types/index';

function createAssetClipBaseFields<TType extends VideoProjectClipType>(params: {
  asset: VideoProjectAsset;
  duration: number;
  groupId: string | null;
  muted: boolean;
  startTime: number;
  trackId: string;
  type: TType;
}) {
  return {
    id: crypto.randomUUID(),
    trackId: params.trackId,
    type: params.type,
    name: params.asset.name,
    groupId: params.groupId,
    linkMode: params.groupId ? VideoClipLinkMode.LINKED : VideoClipLinkMode.DETACHED,
    startTime: params.startTime,
    duration: params.duration,
    muted: params.muted,
    volume: DEFAULT_CLIP_VOLUME,
    audioGainStart: DEFAULT_CLIP_VOLUME,
    audioGainEnd: DEFAULT_CLIP_VOLUME,
    volumeEnvelopeStart: 1,
    volumeEnvelopeEnd: 1,
    fadeInMs: DEFAULT_CLIP_FADE_MS,
    fadeOutMs: DEFAULT_CLIP_FADE_MS,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    assetId: params.asset.id,
  };
}

export function createVideoProjectTransform(
  width: number,
  height: number,
  x = 0,
  y = 0
): VideoProjectTransform {
  return {
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
  };
}

export function createFittedTransform(
  sourceWidth: number,
  sourceHeight: number,
  projectWidth: number,
  projectHeight: number
): VideoProjectTransform {
  return resolveMediaClipTransformForFitMode(
    sourceWidth,
    sourceHeight,
    projectWidth,
    projectHeight,
    VideoMediaFitMode.CONTAIN
  );
}

function createScaledTransform(
  sourceWidth: number,
  sourceHeight: number,
  projectWidth: number,
  projectHeight: number,
  scale: number
): VideoProjectTransform {
  if (sourceWidth <= 0 || sourceHeight <= 0 || projectWidth <= 0 || projectHeight <= 0) {
    return createVideoProjectTransform(projectWidth, projectHeight);
  }

  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const x = Math.round((projectWidth - width) / 2);
  const y = Math.round((projectHeight - height) / 2);

  return createVideoProjectTransform(width, height, x, y);
}

function resolveMediaClipBaseScale(
  sourceWidth: number,
  sourceHeight: number,
  projectWidth: number,
  projectHeight: number,
  fitMode: VideoMediaFitMode
) {
  switch (fitMode) {
    case VideoMediaFitMode.SOURCE_100:
      return 1;
    case VideoMediaFitMode.FIT_LONG_SIDE:
      return Math.max(projectWidth, projectHeight) / Math.max(sourceWidth, sourceHeight);
    case VideoMediaFitMode.FIT_SHORT_SIDE:
    case VideoMediaFitMode.COVER:
      return resolveMediaFitFrame({
        source: { width: sourceWidth, height: sourceHeight },
        output: { width: projectWidth, height: projectHeight },
        fit: 'cover',
      }).scale;
    case VideoMediaFitMode.CONTAIN:
      return resolveMediaFitFrame({
        source: { width: sourceWidth, height: sourceHeight },
        output: { width: projectWidth, height: projectHeight },
        fit: 'contain',
      }).scale;
    case VideoMediaFitMode.STRETCH:
      return 1;
  }
}

function resolveStretchTransform(
  projectWidth: number,
  projectHeight: number,
  scaleMultiplier: number
) {
  return createScaledTransform(
    projectWidth,
    projectHeight,
    projectWidth,
    projectHeight,
    scaleMultiplier
  );
}

export function resolveMediaClipTransformForFitMode(
  sourceWidth: number,
  sourceHeight: number,
  projectWidth: number,
  projectHeight: number,
  fitMode: VideoMediaFitMode,
  fitScalePercent = 100,
  windowHeader?: WindowHeader,
  originalSource = { width: sourceWidth, height: sourceHeight }
): VideoProjectTransform {
  if (
    windowHeader &&
    (fitMode === VideoMediaFitMode.CONTAIN ||
      fitMode === VideoMediaFitMode.COVER ||
      fitMode === VideoMediaFitMode.FIT_SHORT_SIDE)
  ) {
    const scale = Math.max(0.01, fitScalePercent / 100);
    const { headerHeight: _headerHeight, ...frame } = resolveDecoratedMediaFrame({
      sourceWidth: originalSource.width,
      sourceHeight: originalSource.height,
      contentWidth: sourceWidth,
      contentHeight: sourceHeight,
      windowHeader,
      frame: {
        x: (projectWidth * (1 - scale)) / 2,
        y: (projectHeight * (1 - scale)) / 2,
        width: projectWidth * scale,
        height: projectHeight * scale,
      },
      fit: fitMode === VideoMediaFitMode.CONTAIN ? 'contain' : 'cover',
    });
    return { ...frame, rotation: 0, opacity: 1 };
  }
  if (
    windowHeader &&
    (fitMode === VideoMediaFitMode.SOURCE_100 || fitMode === VideoMediaFitMode.FIT_LONG_SIDE)
  ) {
    const headerRatio =
      windowHeaderGeometry(windowHeader, originalSource).height / originalSource.width;
    const scale =
      resolveMediaClipBaseScale(
        sourceWidth,
        sourceHeight + sourceWidth * headerRatio,
        projectWidth,
        projectHeight,
        fitMode
      ) * Math.max(0.01, fitScalePercent / 100);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale + Math.ceil((headerRatio * width) / 2) * 2;
    return {
      x: (projectWidth - width) / 2,
      y: (projectHeight - height) / 2,
      width,
      height,
      rotation: 0,
      opacity: 1,
    };
  }
  const decorated = decoratedMediaSourceSize(sourceWidth, sourceHeight, windowHeader);
  sourceWidth = decorated.width;
  sourceHeight = decorated.height;
  const scaleMultiplier = Math.max(0.01, fitScalePercent / 100);

  if (fitMode === VideoMediaFitMode.STRETCH) {
    return resolveStretchTransform(projectWidth, projectHeight, scaleMultiplier);
  }

  return createScaledTransform(
    sourceWidth,
    sourceHeight,
    projectWidth,
    projectHeight,
    resolveMediaClipBaseScale(sourceWidth, sourceHeight, projectWidth, projectHeight, fitMode) *
      scaleMultiplier
  );
}

function createImageClipFromAsset(
  trackId: string,
  asset: VideoProjectAsset,
  projectWidth: number,
  projectHeight: number,
  startTime: number,
  groupId?: string | null
): VideoProjectImageClip {
  return {
    ...createAssetClipBaseFields({
      asset,
      duration: DEFAULT_IMAGE_CLIP_DURATION,
      groupId: groupId ?? null,
      muted: true,
      startTime,
      trackId,
      type: VideoProjectClipType.IMAGE,
    }),
    transform: createFittedTransform(
      asset.metadata.width,
      asset.metadata.height,
      projectWidth,
      projectHeight
    ),
    fitMode: VideoMediaFitMode.CONTAIN,
    fitScalePercent: 100,
    shadowIntensity: 0,
    shadowMode: VideoMediaShadowMode.BACKDROP,
  };
}

function createVideoMediaClipFromAsset(
  trackId: string,
  asset: VideoProjectAsset,
  projectWidth: number,
  projectHeight: number,
  startTime: number,
  options: {
    groupId?: string | null;
    muted?: boolean;
  }
): VideoProjectVideoClip {
  const duration = Math.max(0.1, asset.metadata.duration ?? DEFAULT_IMAGE_CLIP_DURATION);

  return {
    ...createAssetClipBaseFields({
      asset,
      duration,
      groupId: options.groupId ?? null,
      muted: options.muted ?? false,
      startTime,
      trackId,
      type: VideoProjectClipType.VIDEO,
    }),
    transform: createFittedTransform(
      asset.metadata.width,
      asset.metadata.height,
      projectWidth,
      projectHeight
    ),
    fitMode: VideoMediaFitMode.CONTAIN,
    fitScalePercent: 100,
    shadowIntensity: 0,
    shadowMode: VideoMediaShadowMode.BACKDROP,
    ...(asset.source.kind === 'recording' ||
    (asset.source.kind === 'project-asset' && asset.source.originRecordingId)
      ? { sourceInstanceId: crypto.randomUUID() }
      : {}),
    playbackRate: 1,
    sourceStart: 0,
    sourceDuration: duration,
  };
}

export function createVideoClipFromAsset(
  trackId: string,
  asset: VideoProjectAsset,
  projectWidth: number,
  projectHeight: number,
  startTime = 0,
  options: {
    groupId?: string | null;
    muted?: boolean;
  } = {}
): VideoProjectVideoClip | VideoProjectImageClip {
  if (asset.type === VideoProjectAssetType.IMAGE) {
    return createImageClipFromAsset(
      trackId,
      asset,
      projectWidth,
      projectHeight,
      startTime,
      options.groupId
    );
  }

  return createVideoMediaClipFromAsset(
    trackId,
    asset,
    projectWidth,
    projectHeight,
    startTime,
    options
  );
}

export function createAudioClipFromAsset(
  trackId: string,
  asset: VideoProjectAsset,
  startTime = 0,
  options: {
    groupId?: string | null;
    muted?: boolean;
  } = {}
): VideoProjectAudioClip {
  const duration = Math.max(0.1, asset.metadata.duration ?? DEFAULT_IMAGE_CLIP_DURATION);

  return {
    ...createAssetClipBaseFields({
      asset,
      duration,
      groupId: options.groupId ?? null,
      muted: options.muted ?? false,
      startTime,
      trackId,
      type: VideoProjectClipType.AUDIO,
    }),
    transform: createVideoProjectTransform(0, 0, 0, 0),
    playbackRate: 1,
    sourceStart: 0,
    sourceDuration: duration,
  };
}
