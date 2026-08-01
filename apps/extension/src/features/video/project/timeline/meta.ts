import { translate } from '../../../../platform/i18n';
import { applyVideoProjectMutationPatch } from '../mutation';
import { getAssetById, getSortedTracks } from './basics';
import {
  VideoExportFormat,
  VideoMp4Codec,
  VideoExportScope,
  VideoExportQualityPreset,
  type VideoProject,
  type VideoProjectClip,
  type VideoProjectExportSettings,
  VideoProjectClipType,
  VideoProjectShapeType,
} from '../types';
import {
  resolveVideoOutputDimensions,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';

export function getDefaultExportSettings(project: VideoProject): VideoProjectExportSettings {
  const resolution = VideoResolutionPreset.SOURCE;
  const dimensions = resolveVideoOutputDimensions(project.width, project.height, resolution);
  return {
    width: dimensions.width,
    height: dimensions.height,
    fps: project.fps,
    quality: VideoExportQualityPreset.MEDIUM,
    format: VideoExportFormat.MP4,
    mp4VideoCodec: VideoMp4Codec.AVC,
    resolution,
    scope: VideoExportScope.PROJECT,
    burnInSubtitles: false,
    subtitleSidecarFormats: [],
    downloadAfterExport: true,
  };
}

export function normalizeTrackOrder(project: VideoProject): VideoProject {
  const tracks = getSortedTracks(project).map((track, index) => ({
    ...track,
    order: index,
  }));
  return applyVideoProjectMutationPatch(project, {
    tracks,
  });
}

export function buildClipLabel(project: VideoProject, clip: VideoProjectClip): string {
  if (clip.type === VideoProjectClipType.TEXT) {
    return clip.text.trim().slice(0, 36) || translate('shared.videoProject.defaultTextClipName');
  }
  if (clip.type === VideoProjectClipType.ANNOTATION) {
    return (
      clip.content.headline.trim().slice(0, 36) ||
      translate('shared.videoProject.defaultAnnotationClipName')
    );
  }
  if (clip.type === VideoProjectClipType.EFFECT) {
    return clip.name;
  }
  if (clip.type === VideoProjectClipType.SUBTITLE) {
    return (
      clip.text.trim().slice(0, 36) || translate('shared.videoProject.defaultSubtitleClipName')
    );
  }
  if (clip.type === VideoProjectClipType.SHAPE) {
    switch (clip.shapeType) {
      case VideoProjectShapeType.ELLIPSE:
        return translate('shared.videoProject.defaultEllipseClipName');
      case VideoProjectShapeType.LINE:
        return translate('shared.videoProject.defaultLineClipName');
      case VideoProjectShapeType.ARROW:
        return translate('shared.videoProject.defaultArrowClipName');
      case VideoProjectShapeType.RECTANGLE:
        return translate('shared.videoProject.defaultRectangleClipName');
    }
  }
  if (clip.type === VideoProjectClipType.AUDIO) {
    const asset = getAssetById(project, clip.assetId);
    return asset?.name ?? clip.name ?? translate('shared.videoProject.clipLabelAudioFallback');
  }
  const asset = getAssetById(project, clip.assetId);
  return asset?.name ?? clip.name;
}
