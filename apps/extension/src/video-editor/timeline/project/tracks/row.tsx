import { useEffectDocumentDrag } from '../../../chrome/effect-document-drag';
import { useState } from 'react';
import { createTrackEffectDropHandlers } from '../canvas/parts/effect-drop';
import type { ProjectTimelineProps } from '../types';
import { VideoTrackKind } from '../../../../features/video/project/types';
import { Eye, EyeOff, Lock, Unlock, Volume2, VolumeX } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { VideoProject } from '../../../../features/video/project/types';
import { getTrackKindLabel } from '../interaction-state/helpers';
import { TimelineIconButton } from '../controls/icon-button';
import { getTrackIcon, TimelineLaneIdentity, TIMELINE_LANE_HEADER_CLASS_NAME } from './lane-icons';
import type { TimelineTrackLayout } from './layout';

const TRACK_SELECT_FOCUS_CLASS_NAME = [
  'rounded-[9px] focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-[var(--sniptale-color-focus-ring)]',
].join(' ');

interface ProjectTimelineTrackRowProps {
  onToggleFx?: () => void;
  project?: VideoProject;
  onDropEffectDocument?: ProjectTimelineProps['onDropEffectDocument'];
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
  onToggleFx,
  project,
  onDropEffectDocument,
  compactRows,
  isSelected,
  track,
  trackLabel,
  trackLayout,
  onSelectTrack,
  onToggleTrackLock,
  onToggleTrackVisibility,
}: ProjectTimelineTrackRowProps) {
  const { drag } = useEffectDocumentDrag();
  const [dropActive, setDropActive] = useState(false);
  const drop = project
    ? createTrackEffectDropHandlers({
        project,
        track,
        header: true,
        dragKind: drag?.kind,
        pixelsPerSecond: 1,
        onDrop: onDropEffectDocument,
        onHighlight: (id) => setDropActive(id !== null),
      })
    : null;
  return (
    <div
      style={{ height: trackLayout?.rowHeight }}
      onDragOver={(event) => drop?.onDragOver(event)}
      onDrop={(event) => drop?.onDrop(event)}
      onDragLeave={() => setDropActive(false)}
      className={
        dropActive ? 'outline outline-1 outline-[var(--sniptale-color-accent)]' : undefined
      }
    >
      <div
        className={TIMELINE_LANE_HEADER_CLASS_NAME}
        data-selected={isSelected}
        style={{ height: trackLayout?.clipRowHeight }}
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
      {Boolean(trackLayout?.fxHeight) && (
        <div
          style={{ height: trackLayout?.fxHeight }}
          className="border-b border-[var(--sniptale-color-border-soft)] px-3"
        >
          <button
            type="button"
            onClick={onToggleFx}
            aria-expanded={!trackLayout?.fxCollapsed}
            className="flex h-5 items-center gap-1 text-[11px] text-[var(--sniptale-color-text-muted)]"
            title={translate('videoEditor.effectsLibrary.toggleTimelineEffects')}
          >
            <span aria-hidden="true">{trackLayout?.fxCollapsed ? '▸' : '▾'}</span>
            {translate('videoEditor.effectsLibrary.fxCount').replace(
              '{count}',
              String(trackLayout?.fxInstanceIds.length ?? 0)
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectTimelineTrackMeta({
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
        'flex-1 gap-2 text-left',
        TRACK_SELECT_FOCUS_CLASS_NAME,
      ].join(' ')}
      onClick={() => onSelectTrack(track.id)}
    >
      <TimelineLaneIdentity
        selected={isSelected}
        icon={getTrackIcon(track)}
        prefix={trackLabel}
        name={track.name || getTrackKindLabel(track.kind)}
      />
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
        active={!track.visible}
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
