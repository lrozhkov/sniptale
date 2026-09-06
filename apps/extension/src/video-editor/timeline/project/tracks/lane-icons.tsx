import {
  Activity,
  Camera,
  Film,
  MousePointer2,
  Search,
  Sparkles,
  Type,
  Volume2,
} from 'lucide-react';
import type React from 'react';
import type { VideoProjectUtilityLaneKind } from '../../../../features/video/project/utility-lanes';
import { VideoProjectTrackRole, VideoTrackKind } from '../../../../features/video/project/types';
import type { VideoProjectTrack } from '../../../../features/video/project/types';

const TRACK_ICON_CLASS_NAME = 'h-4 w-4';

export function TimelineLaneIconFrame({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={[
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] border',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
      ].join(' ')}
      data-ui="timeline.track-kind-icon"
    >
      {children}
    </span>
  );
}

function getTrackKindIcon(kind: VideoProjectTrack['kind']) {
  switch (kind) {
    case VideoTrackKind.PRIMARY:
      return <Film className={TRACK_ICON_CLASS_NAME} />;
    case VideoTrackKind.AUDIO:
      return <Volume2 className={TRACK_ICON_CLASS_NAME} />;
    case VideoTrackKind.OVERLAY:
      return <Sparkles className={TRACK_ICON_CLASS_NAME} />;
    case VideoTrackKind.SUBTITLE:
      return <Type className={TRACK_ICON_CLASS_NAME} />;
  }
}

export function getTrackIcon(track: Pick<VideoProjectTrack, 'kind' | 'role'>) {
  return track.role === VideoProjectTrackRole.CAMERA ? (
    <Camera className={TRACK_ICON_CLASS_NAME} data-camera-track-icon />
  ) : (
    getTrackKindIcon(track.kind)
  );
}

export function getUtilityLaneIcon(lane: VideoProjectUtilityLaneKind) {
  switch (lane) {
    case 'actions':
      return <Sparkles className={TRACK_ICON_CLASS_NAME} />;
    case 'camera':
      return <Search className={TRACK_ICON_CLASS_NAME} />;
  }
}

export function getTelemetryLaneIcon() {
  return <Activity className={TRACK_ICON_CLASS_NAME} />;
}

export function getCursorLaneIcon() {
  return <MousePointer2 className={TRACK_ICON_CLASS_NAME} />;
}
