import { DEFAULT_VIDEO_SUBTITLE_TRACK_STYLE } from '../defaults';
import type {
  VideoProject,
  VideoProjectSubtitleClip,
  VideoProjectSubtitleTrackStyle,
  VideoProjectTextClip,
  VideoProjectTrack,
  VideoProjectTransform,
} from '../types/index';
import { VideoProjectClipType, VideoTrackKind } from '../types/index';

function clampPercent(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(100, Math.max(1, value));
}

export function getSubtitleTrackStyle(
  track: Pick<VideoProjectTrack, 'kind' | 'subtitleStyle'>
): VideoProjectSubtitleTrackStyle {
  if (track.kind !== VideoTrackKind.SUBTITLE) {
    return { ...DEFAULT_VIDEO_SUBTITLE_TRACK_STYLE };
  }

  const style = track.subtitleStyle ?? DEFAULT_VIDEO_SUBTITLE_TRACK_STYLE;
  return {
    ...DEFAULT_VIDEO_SUBTITLE_TRACK_STYLE,
    ...style,
    maxWidthPercent: clampPercent(
      style.maxWidthPercent,
      DEFAULT_VIDEO_SUBTITLE_TRACK_STYLE.maxWidthPercent
    ),
    safeAreaPercent: clampPercent(
      style.safeAreaPercent,
      DEFAULT_VIDEO_SUBTITLE_TRACK_STYLE.safeAreaPercent
    ),
  };
}

export function resolveSubtitleTrackTransform(
  project: Pick<VideoProject, 'height' | 'width'>,
  style: VideoProjectSubtitleTrackStyle
): VideoProjectTransform {
  const width = Math.round(project.width * (style.maxWidthPercent / 100));
  const height = Math.max(
    Math.round(style.fontSize * style.lineHeight * 2.6 + style.padding * 2),
    Math.round(project.height * 0.12)
  );
  const safeAreaOffset = Math.round(project.height * (style.safeAreaPercent / 100));
  const x = Math.round((project.width - width) / 2);
  const y =
    style.placement === 'TOP'
      ? safeAreaOffset
      : Math.max(0, project.height - height - safeAreaOffset);

  return {
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
  };
}

export function resolveSubtitleClipStyle(
  project: {
    tracks: Array<Pick<VideoProjectTrack, 'id' | 'kind' | 'subtitleStyle'>>;
  },
  clip: VideoProjectSubtitleClip
): VideoProjectSubtitleTrackStyle {
  const track = project.tracks.find((item) => item.id === clip.trackId);
  return getSubtitleTrackStyle(
    track ?? {
      kind: VideoTrackKind.SUBTITLE,
      subtitleStyle: DEFAULT_VIDEO_SUBTITLE_TRACK_STYLE,
    }
  );
}

export function resolveTextualClipStyle(
  project: {
    tracks: Array<Pick<VideoProjectTrack, 'id' | 'kind' | 'subtitleStyle'>>;
  },
  clip: VideoProjectTextClip | VideoProjectSubtitleClip
) {
  if (clip.type === VideoProjectClipType.SUBTITLE) {
    return resolveSubtitleClipStyle(project, clip);
  }

  return clip.style;
}

export function isSubtitleTrack(track: Pick<VideoProjectTrack, 'kind'>): boolean {
  return track.kind === VideoTrackKind.SUBTITLE;
}
