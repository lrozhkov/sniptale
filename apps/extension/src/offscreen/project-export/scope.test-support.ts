import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMediaFitMode,
  VideoProjectClipType,
  type VideoProject,
  type VideoProjectClip,
  type VideoProjectExportSettings,
} from '../../features/video/project/types';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';

type ScopeClipType =
  | typeof VideoProjectClipType.AUDIO
  | typeof VideoProjectClipType.SUBTITLE
  | typeof VideoProjectClipType.VIDEO;

export function createScopeClip(id: string, type: ScopeClipType): VideoProjectClip {
  const baseClip = {
    duration: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    groupId: null,
    id,
    linkMode: VideoClipLinkMode.DETACHED,
    muted: false,
    name: id,
    startTime: 0,
    trackId: 'track-1',
    transform: { height: 100, opacity: 1, rotation: 0, width: 100, x: 0, y: 0 },
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    volume: 1,
  };

  if (type === VideoProjectClipType.SUBTITLE) return { ...baseClip, text: id, type };
  if (type === VideoProjectClipType.AUDIO) {
    return { ...baseClip, assetId: `${id}-asset`, sourceDuration: 1, sourceStart: 0, type };
  }
  return {
    ...baseClip,
    assetId: `${id}-asset`,
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceDuration: 1,
    sourceStart: 0,
    type,
  };
}

export function createScopeProject(clips: VideoProjectClip[]): VideoProject {
  return { ...createEmptyVideoProject('Scope test'), clips };
}

export function createScopeSettings(
  overrides: Partial<VideoProjectExportSettings>
): VideoProjectExportSettings {
  return {
    downloadAfterExport: true,
    format: VideoExportFormat.MP4,
    fps: 30,
    height: 720,
    quality: VideoExportQualityPreset.BALANCED,
    width: 1280,
    ...overrides,
  };
}
