import { VideoTrackKind } from '../../../../features/video/project/types';
import { Eye, EyeOff, Lock, Unlock, Volume2, VolumeX } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { VideoProject } from '../../../../features/video/project/types';
import { getTrackKindLabel } from '../interaction-state/helpers';
import { TimelineIconButton } from '../controls/icon-button';
import { getTrackIcon, TimelineLaneIconFrame } from './lane-icons';
import type { TimelineTrackLayout } from './layout';

const TRACK_SELECT_FOCUS_CLASS_NAME = [
  'rounded-[9px] focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
].join(' ');

interface ProjectTimelineTrackRowProps {
  compactRows: boolean;
  isSelected: boolean;
  track: VideoProject['tracks'][number];
  trackLabel: string;
  trackLayout: TimelineTrackLayout | undefined;
  onSelectTrack: (trackId: string) => void;
  onToggleTrackLock: (trackId: string) => void;
  onToggleTrackVisibility: (trackId: string) => void;
}

export function ProjectTimelineTrackRow({
  compactRows,
  isSelected,
  track,
  trackLabel,
  trackLayout,
  onSelectTrack,
  onToggleTrackLock,
  onToggleTrackVisibility,
}: ProjectTimelineTrackRowProps) {
  return (
    <div
      className={[
        'relative flex items-center border-b border-[color:var(--sniptale-color-border-subtle)] transition',
        compactRows ? 'gap-1 px-2' : 'gap-2 px-3',
        isSelected
          ? 'bg-[color:var(--sniptale-color-surface-panel)]'
          : 'hover:bg-[color:var(--sniptale-color-surface-panel)]',
      ].join(' ')}
      style={{ height: trackLayout?.rowHeight }}
    >
      <ProjectTimelineTrackMeta
        compactRows={compactRows}
        isSelected={isSelected}
        track={track}
        trackLabel={trackLabel}
        onSelectTrack={onSelectTrack}
      />
      <ProjectTimelineTrackStateControls
        track={track}
        onToggleTrackLock={onToggleTrackLock}
        onToggleTrackVisibility={onToggleTrackVisibility}
      />
    </div>
  );
}

function ProjectTimelineTrackMeta({
  compactRows,
  isSelected,
  track,
  trackLabel,
  onSelectTrack,
}: Pick<
  ProjectTimelineTrackRowProps,
  'compactRows' | 'isSelected' | 'onSelectTrack' | 'track' | 'trackLabel'
>) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      data-ui="video-editor.timeline.track-select"
      className={[
        'flex min-w-0 items-center',
        compactRows ? 'flex-1 gap-1 text-left' : 'flex-1 gap-2 text-left',
        TRACK_SELECT_FOCUS_CLASS_NAME,
      ].join(' ')}
      onClick={() => onSelectTrack(track.id)}
    >
      <TimelineLaneIconFrame>{getTrackIcon(track)}</TimelineLaneIconFrame>
      <>
        <span className="shrink-0 text-[10px] font-semibold tabular-nums text-[var(--sniptale-color-text-dim)]">
          {trackLabel}
        </span>
        <span
          data-timeline-track-name="true"
          className="truncate text-xs font-semibold text-[var(--sniptale-color-text-primary)]"
        >
          {track.name || getTrackKindLabel(track.kind)}
        </span>
      </>
    </button>
  );
}

function ProjectTimelineTrackStateControls({
  track,
  onToggleTrackLock,
  onToggleTrackVisibility,
}: Pick<ProjectTimelineTrackRowProps, 'track' | 'onToggleTrackLock' | 'onToggleTrackVisibility'>) {
  const isAudio = track.kind === VideoTrackKind.AUDIO;
  const EnabledIcon = isAudio ? Volume2 : Eye;
  const DisabledIcon = isAudio ? VolumeX : EyeOff;
  return (
    <div className="flex gap-1">
      <TimelineIconButton
        frameless
        active={track.visible}
        icon={
          track.visible ? (
            <EnabledIcon size={13} strokeWidth={2} />
          ) : (
            <DisabledIcon size={13} strokeWidth={2} />
          )
        }
        onClick={() => onToggleTrackVisibility(track.id)}
        stopPropagation
        title={
          track.visible
            ? translate(
                isAudio
                  ? 'videoEditor.timeline.trackAudioEnabled'
                  : 'videoEditor.timeline.trackVisible'
              )
            : translate(
                isAudio
                  ? 'videoEditor.timeline.trackAudioMuted'
                  : 'videoEditor.timeline.trackHidden'
              )
        }
      />
      <TimelineIconButton
        frameless
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
