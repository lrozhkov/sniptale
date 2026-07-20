import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { VideoProject } from '../../../../features/video/project/types';
import { getTrackKindLabel } from '../interaction-state/helpers';
import { TimelineIconButton } from '../controls/icon-button';
import { getTrackKindIcon, TimelineLaneIconFrame } from './lane-icons';
import { ProjectTimelineLogicalLaneRail } from './lane-rail';
import type { TimelineTrackLayout } from './layout';

interface ProjectTimelineTrackRowProps {
  compactRows: boolean;
  isSelected: boolean;
  track: VideoProject['tracks'][number];
  trackLayout: TimelineTrackLayout | undefined;
  onAddTrackLogicalLane: (trackId: string) => void;
  onSelectTrack: (trackId: string) => void;
  onToggleTrackLock: (trackId: string) => void;
  onToggleTrackVisibility: (trackId: string) => void;
}

export function ProjectTimelineTrackRow({
  compactRows,
  isSelected,
  track,
  trackLayout,
  onAddTrackLogicalLane,
  onSelectTrack,
  onToggleTrackLock,
  onToggleTrackVisibility,
}: ProjectTimelineTrackRowProps) {
  return (
    <div
      className={[
        'relative flex items-center border-b border-[color:var(--sniptale-color-border-subtle)] transition',
        compactRows ? 'justify-center px-1' : 'gap-2 px-3',
        isSelected
          ? 'bg-[color:var(--sniptale-color-surface-panel)]'
          : 'hover:bg-[color:var(--sniptale-color-surface-panel)]',
      ].join(' ')}
      style={{ height: trackLayout?.rowHeight }}
      onClick={() => onSelectTrack(track.id)}
    >
      <ProjectTimelineTrackMeta compactRows={compactRows} track={track} />
      {compactRows ? null : (
        <ProjectTimelineTrackStateControls
          track={track}
          onToggleTrackLock={onToggleTrackLock}
          onToggleTrackVisibility={onToggleTrackVisibility}
        />
      )}
      <ProjectTimelineLogicalLaneRail
        compactRows={compactRows}
        track={track}
        trackLayout={trackLayout}
        onAddTrackLogicalLane={onAddTrackLogicalLane}
      />
    </div>
  );
}

function ProjectTimelineTrackMeta({
  compactRows,
  track,
}: Pick<ProjectTimelineTrackRowProps, 'compactRows' | 'track'>) {
  return (
    <div
      className={
        compactRows ? 'flex min-w-0 items-center' : 'flex min-w-0 flex-1 items-center gap-2.5'
      }
    >
      <TimelineLaneIconFrame>{getTrackKindIcon(track.kind)}</TimelineLaneIconFrame>
      {compactRows ? null : (
        <p className="truncate text-xs font-semibold text-[var(--sniptale-color-text-primary)]">
          {getTrackKindLabel(track.kind)}
        </p>
      )}
    </div>
  );
}

function ProjectTimelineTrackStateControls({
  track,
  onToggleTrackLock,
  onToggleTrackVisibility,
}: Pick<ProjectTimelineTrackRowProps, 'track' | 'onToggleTrackLock' | 'onToggleTrackVisibility'>) {
  return (
    <div className="flex gap-1">
      <TimelineIconButton
        active={track.visible}
        icon={
          track.visible ? <Eye size={13} strokeWidth={2} /> : <EyeOff size={13} strokeWidth={2} />
        }
        onClick={() => onToggleTrackVisibility(track.id)}
        stopPropagation
        title={
          track.visible
            ? translate('videoEditor.timeline.trackVisible')
            : translate('videoEditor.timeline.trackHidden')
        }
      />
      <TimelineIconButton
        active={track.locked}
        icon={
          track.locked ? <Lock size={13} strokeWidth={2} /> : <Unlock size={13} strokeWidth={2} />
        }
        onClick={() => onToggleTrackLock(track.id)}
        stopPropagation
        title={
          track.locked
            ? translate('videoEditor.timeline.trackLocked')
            : translate('videoEditor.timeline.trackEditable')
        }
      />
    </div>
  );
}
