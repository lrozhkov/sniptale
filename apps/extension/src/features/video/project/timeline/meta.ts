import { translate } from '../../../../platform/i18n';
import { applyVideoProjectMutationPatch } from '../mutation';
import {
  getAssetById,
  getSortedTracks,
  isAudioClip,
  isVideoClip,
  clampClipPlaybackRate,
} from './basics';
import {
  VideoExportFormat,
  VideoExportScope,
  VideoExportQualityPreset,
  type VideoProjectAudioClip,
  type VideoProject,
  type VideoProjectClip,
  type VideoProjectExportSettings,
  type VideoProjectVideoClip,
  VideoProjectClipType,
  VideoProjectShapeType,
} from '../types';

export function getDefaultExportSettings(project: VideoProject): VideoProjectExportSettings {
  return {
    width: project.width,
    height: project.height,
    fps: project.fps,
    quality: VideoExportQualityPreset.BALANCED,
    format: VideoExportFormat.MP4,
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

function hasCompatibleAudioPair(
  project: VideoProject,
  clip: VideoProjectVideoClip,
  audioClips: VideoProjectAudioClip[]
): boolean {
  if (audioClips.length === 0) {
    return true;
  }

  const audioClip = audioClips[0];
  if (!audioClip) {
    return false;
  }

  const audioTrack = project.tracks.find((track) => track.id === audioClip.trackId);
  return Boolean(
    audioTrack?.visible &&
    !audioClip.muted &&
    audioClip.assetId === clip.assetId &&
    Math.abs(audioClip.startTime - clip.startTime) < 0.01 &&
    Math.abs(audioClip.sourceStart - clip.sourceStart) < 0.01 &&
    Math.abs(
      clampClipPlaybackRate(audioClip.playbackRate ?? 1) -
        clampClipPlaybackRate(clip.playbackRate ?? 1)
    ) < 0.001 &&
    Math.abs(audioClip.duration - clip.duration) < 0.05 &&
    Math.abs(audioClip.sourceDuration - clip.sourceDuration) < 0.05
  );
}

export function isSimplePassthroughProject(
  project: VideoProject,
  settings: VideoProjectExportSettings
): boolean {
  if (
    (settings.scope ?? VideoExportScope.PROJECT) !== VideoExportScope.PROJECT ||
    (project.effectInstances ?? []).some(({ enabled }) => enabled) ||
    settings.burnInSubtitles === true ||
    (settings.subtitleSidecarFormats?.length ?? 0) > 0 ||
    settings.rangeStartSeconds !== undefined ||
    settings.rangeEndSeconds !== undefined
  ) {
    return false;
  }

  const visibleTracksWithClips = project.tracks.filter(
    (track) => track.visible && project.clips.some((clip) => clip.trackId === track.id)
  );
  const visualClips = project.clips.filter((clip) => !isAudioClip(clip));
  const audioClips = project.clips.filter(isAudioClip);
  if (visibleTracksWithClips.length > 2 || visualClips.length !== 1 || audioClips.length > 1) {
    return false;
  }

  const clip = visualClips[0];
  if (!clip || !isVideoClip(clip)) {
    return false;
  }

  const coversCanvas =
    Math.abs(clip.transform.x) < 0.5 &&
    Math.abs(clip.transform.y) < 0.5 &&
    Math.abs(clip.transform.width - project.width) < 0.5 &&
    Math.abs(clip.transform.height - project.height) < 0.5 &&
    Math.abs(clip.transform.opacity - 1) < 0.01 &&
    Math.abs(clip.transform.rotation) < 0.01;

  return (
    hasCompatibleAudioPair(project, clip, audioClips) &&
    coversCanvas &&
    Math.abs(clip.startTime) < 0.01 &&
    Math.abs(clip.sourceStart) < 0.01 &&
    Math.abs(clampClipPlaybackRate(clip.playbackRate ?? 1) - 1) < 0.001 &&
    Math.abs(clip.duration - clip.sourceDuration) < 0.05 &&
    Math.abs(project.width - settings.width) < 0.5 &&
    Math.abs(project.height - settings.height) < 0.5
  );
}
