import { isMimeTypeCompatibleWithFormat } from '../../persistence';
import { getAssetById } from '../../../../features/video/project/timeline/basics';
import { getMediaClipSourceTime } from '../../../../features/video/project/timeline/rate';
import { resolveVideoCompositionRenderPasses } from '../../../../features/video/composition/timeline/render';
import type { VideoCompositionTimelineIndex } from '../../../../features/video/composition/timeline/frame/index';
import {
  VideoExportFormat,
  type VideoProjectExportSettings,
} from '../../../../features/video/project/types/export';
import {
  type VideoProject,
  type VideoProjectAsset,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types/model';
import type { VideoCompositionVisualLayer } from '../../../../features/video/composition/types';
import type { Mp4CompositeRenderReason, Mp4VideoRenderSpan } from './types';
import { getSingleVisibleVideoClip } from './visible-clips';

const CLEAN_SAMPLE_EPSILON_SECONDS = 1 / 240;
const DIMENSION_EPSILON = 0.5;
const OPACITY_EPSILON = 0.001;

export function nearlyEqual(left: number, right: number, epsilon = DIMENSION_EPSILON): boolean {
  return Math.abs(left - right) <= epsilon;
}

function createCompositeSpan(
  start: number,
  end: number,
  reason: Mp4CompositeRenderReason
): Mp4VideoRenderSpan {
  return { kind: 'composite', reason, start, end };
}

function getFullCanvasCompositeReason(
  project: VideoProject,
  settings: VideoProjectExportSettings,
  clip: VideoProjectVideoClip,
  asset: VideoProjectAsset
): Mp4CompositeRenderReason | null {
  const sourceWidth = asset.metadata.width ?? 0;
  const sourceHeight = asset.metadata.height ?? 0;
  if (settings.width !== project.width || settings.height !== project.height) {
    return 'export-size';
  }

  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    !nearlyEqual(sourceWidth, settings.width) ||
    !nearlyEqual(sourceHeight, settings.height)
  ) {
    return 'source-size';
  }

  if (clip.shadowIntensity) {
    return 'shadow';
  }

  if (
    !nearlyEqual(clip.transform.x, 0) ||
    !nearlyEqual(clip.transform.y, 0) ||
    !nearlyEqual(clip.transform.width, project.width) ||
    !nearlyEqual(clip.transform.height, project.height) ||
    !nearlyEqual(clip.transform.rotation, 0, OPACITY_EPSILON) ||
    !nearlyEqual(clip.transform.opacity, 1, OPACITY_EPSILON)
  ) {
    return 'transform';
  }

  return Math.abs((clip.playbackRate ?? 1) - 1) <= OPACITY_EPSILON ? null : 'playback-rate';
}

function isHybridCleanSourceAsset(
  asset: VideoProjectAsset | undefined,
  settings: VideoProjectExportSettings
): asset is VideoProjectAsset {
  return Boolean(
    asset &&
    settings.format === VideoExportFormat.MP4 &&
    isMimeTypeCompatibleWithFormat(asset.metadata.mimeType, VideoExportFormat.MP4)
  );
}

function isIdentityRenderState(layer: VideoCompositionVisualLayer): boolean {
  return (
    nearlyEqual(layer.opacity, 1, OPACITY_EPSILON) &&
    nearlyEqual(layer.renderState.blurAmount, 0, OPACITY_EPSILON) &&
    nearlyEqual(layer.renderState.opacityMultiplier, 1, OPACITY_EPSILON) &&
    nearlyEqual(layer.renderState.scaleX, 1, OPACITY_EPSILON) &&
    nearlyEqual(layer.renderState.scaleY, 1, OPACITY_EPSILON) &&
    nearlyEqual(layer.renderState.translateX, 0, OPACITY_EPSILON) &&
    nearlyEqual(layer.renderState.translateY, 0, OPACITY_EPSILON)
  );
}

function getCompositionCompositeReason(
  project: VideoProject,
  settings: VideoProjectExportSettings,
  clip: VideoProjectVideoClip,
  currentTime: number,
  timelineIndex: VideoCompositionTimelineIndex
): Mp4CompositeRenderReason | null {
  const renderPasses = resolveVideoCompositionRenderPasses(project, currentTime, {
    includeSubtitles: settings.burnInSubtitles === true,
    timelineIndex,
  });
  const overlayFrame = renderPasses.overlayFrame;
  const layer = overlayFrame.visualLayers[0];
  if (overlayFrame.actions.length > 0 || overlayFrame.cursor !== null) {
    return overlayFrame.cursor !== null ? 'cursor-overlay' : 'visual-layer';
  }

  if (
    overlayFrame.camera.regionId !== null ||
    overlayFrame.camera.motionBlurAmount > 0 ||
    !nearlyEqual(overlayFrame.camera.scale, 1, OPACITY_EPSILON) ||
    !nearlyEqual(overlayFrame.camera.viewportX, 0, OPACITY_EPSILON) ||
    !nearlyEqual(overlayFrame.camera.viewportY, 0, OPACITY_EPSILON) ||
    renderPasses.visualPasses.length !== 1
  ) {
    return 'camera-motion';
  }

  if ((renderPasses.visualPasses[0]?.transitionOverlays.length ?? 0) > 0) {
    return 'transition';
  }

  if (
    overlayFrame.visualLayers.length !== 1 ||
    layer?.kind !== 'video' ||
    layer.clipId !== clip.id
  ) {
    return 'visual-layer';
  }

  return isIdentityRenderState(layer) ? null : 'visual-effect';
}

function getSampleTimes(start: number, end: number): number[] {
  return end - start <= CLEAN_SAMPLE_EPSILON_SECONDS * 2
    ? [(start + end) / 2]
    : [start + CLEAN_SAMPLE_EPSILON_SECONDS, (start + end) / 2, end - CLEAN_SAMPLE_EPSILON_SECONDS];
}

export function createCleanSourceSpan(
  project: VideoProject,
  settings: VideoProjectExportSettings,
  start: number,
  end: number,
  timelineIndex: VideoCompositionTimelineIndex
): Mp4VideoRenderSpan {
  if (settings.burnInSubtitles === true) {
    return createCompositeSpan(start, end, 'subtitles');
  }

  const clip = getSingleVisibleVideoClip(timelineIndex, (start + end) / 2);
  if (!clip) {
    return createCompositeSpan(start, end, 'visible-clips');
  }

  const asset = getAssetById(project, clip.assetId);
  if (!asset) {
    return createCompositeSpan(start, end, 'asset-missing');
  }

  if (!isHybridCleanSourceAsset(asset, settings)) {
    return createCompositeSpan(start, end, 'non-mp4-asset');
  }

  const fullCanvasReason = getFullCanvasCompositeReason(project, settings, clip, asset);
  if (fullCanvasReason) {
    return createCompositeSpan(start, end, fullCanvasReason);
  }

  const compositionReason = getSampleTimes(start, end)
    .map((time) => getCompositionCompositeReason(project, settings, clip, time, timelineIndex))
    .find((reason): reason is Mp4CompositeRenderReason => reason !== null);
  if (compositionReason) {
    return createCompositeSpan(start, end, compositionReason);
  }

  return {
    asset,
    clip,
    end,
    kind: 'clean-source',
    sourceEnd: getMediaClipSourceTime(clip, end),
    sourceStart: getMediaClipSourceTime(clip, start),
    start,
  };
}
