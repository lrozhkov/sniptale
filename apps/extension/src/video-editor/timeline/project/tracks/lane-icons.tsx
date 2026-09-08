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

export const TIMELINE_LANE_HEADER_CLASS_NAME = [
  'relative flex items-center gap-2 border-b px-2',
  'border-[var(--sniptale-color-border-subtle)] text-[var(--sniptale-color-text-secondary)]',
  'hover:bg-[var(--sniptale-color-surface-panel)]',
  'data-[selected=true]:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');

function TimelineLaneIconFrame({
  children,
  selected,
}: {
  children: React.ReactNode;
  selected: boolean;
}) {
  return (
    <span
      className={[
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] border',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
        selected
          ? 'text-[var(--sniptale-color-accent-emphasis)]'
          : 'text-[var(--sniptale-color-text-secondary)]',
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

export function TimelineLaneIdentity({
  icon,
  prefix,
  name,
  selected = false,
}: {
  icon: React.ReactNode;
  prefix: string;
  name: string;
  selected?: boolean;
}) {
  return (
    <>
      <TimelineLaneIconFrame selected={selected}>{icon}</TimelineLaneIconFrame>
      <span
        data-timeline-track-prefix
        className="shrink-0 text-[10px] font-semibold tabular-nums text-[var(--sniptale-color-text-dim)]"
      >
        {prefix}
      </span>
      <span
        data-timeline-track-name="true"
        className="truncate text-xs font-semibold text-[var(--sniptale-color-text-primary)]"
      >
        {name}
      </span>
    </>
  );
}
