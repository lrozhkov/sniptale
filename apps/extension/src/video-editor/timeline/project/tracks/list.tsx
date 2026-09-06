import { ProjectTimelineAddTrackControl } from '../toolbar/sections/add-controls';
import type { ProjectTimelineInsertionActions } from '../types';
import type { MutableRefObject } from 'react';
import { translate } from '../../../../platform/i18n';
import type { VideoProjectUtilityLaneKind } from '../../../../features/video/project/utility-lanes';
import {
  VideoProjectTrackRole,
  VideoTrackKind,
  type VideoProject,
} from '../../../../features/video/project/types';
import { ProjectTimelineEffectLaneLabelRows } from '../effect-lanes/labels';
import type { TimelineTrackLayoutModel } from './layout';
import { ProjectTimelineTelemetryLaneLabelRow } from '../effect-lanes/telemetry-lane';
import { ProjectTimelineTrackRow } from './row';
import type { useProjectTimelinePanelPrefs } from '../panel/prefs';

interface ProjectTimelineTrackListProps {
  cursorLaneVisible: boolean;
  project: VideoProject;
  selectedTrackId: string | null;
  showTelemetryLane: boolean;
  trackLayoutModel: TimelineTrackLayoutModel;
  trackListRef: MutableRefObject<HTMLDivElement | null>;
  trackPanelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
  tracks: VideoProject['tracks'];
  onAddTrack: ProjectTimelineInsertionActions['onAddTrack'];
  onAddMotionRegion: () => void;
  onClearUtilityLane: (lane: VideoProjectUtilityLaneKind) => void;
  onScroll: () => void;
  onSelectTrack: (trackId: string) => void;
  onToggleTrackLock: (trackId: string) => void;
  onToggleTrackVisibility: (trackId: string) => void;
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
}

export function ProjectTimelineTrackList(props: ProjectTimelineTrackListProps) {
  return (
    <div
      className={[
        'flex min-h-0 flex-col border-r',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[color:var(--sniptale-color-surface-overlay)]',
      ].join(' ')}
    >
      <ProjectTimelineTrackListHeader onAddTrack={props.onAddTrack} />
      <ProjectTimelineTrackListScrollArea {...props} />
    </div>
  );
}

function ProjectTimelineTrackListHeader(props: Pick<ProjectTimelineTrackListProps, 'onAddTrack'>) {
  return (
    <div
      className={[
        'flex h-[30px] items-center border-b text-[11px]',
        'justify-between px-3',
        'font-semibold',
        'border-[color:var(--sniptale-color-border-soft)]',
        'text-[var(--sniptale-color-text-muted)]',
      ].join(' ')}
    >
      <span>{translate('videoEditor.timeline.tracksTitle')}</span>
      <ProjectTimelineAddTrackControl onAddTrack={props.onAddTrack} />
    </div>
  );
}

function ProjectTimelineTrackListScrollArea(props: ProjectTimelineTrackListProps) {
  return (
    <div
      ref={props.trackListRef}
      data-project-timeline-track-list="true"
      className="grid min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      onScroll={props.onScroll}
    >
      <ProjectTimelineRailRows {...props} />
    </div>
  );
}

function ProjectTimelineRailRows(props: {
  cursorLaneVisible: boolean;
  project: VideoProject;
  selectedTrackId: string | null;
  showTelemetryLane: boolean;
  trackLayoutModel: TimelineTrackLayoutModel;
  trackPanelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
  tracks: VideoProject['tracks'];
  onAddMotionRegion: () => void;
  onClearUtilityLane: (lane: VideoProjectUtilityLaneKind) => void;
  onSelectTrack: (trackId: string) => void;
  onToggleTrackLock: (trackId: string) => void;
  onToggleTrackVisibility: (trackId: string) => void;
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
}) {
  return (
    <div className="min-w-0">
      {props.showTelemetryLane ? (
        <ProjectTimelineTelemetryLaneLabelRow compactRows={false} />
      ) : null}
      {props.tracks.map((track, index) => (
        <ProjectTimelineTrackRow
          key={track.id}
          compactRows={props.trackPanelPrefs.prefs.compactRows}
          isSelected={props.selectedTrackId === track.id}
          trackLabel={getTrackPositionLabel(props.tracks, index)}
          trackLayout={props.trackLayoutModel.layoutByTrackId.get(track.id)}
          track={track}
          onSelectTrack={props.onSelectTrack}
          onToggleTrackLock={props.onToggleTrackLock}
          onToggleTrackVisibility={props.onToggleTrackVisibility}
        />
      ))}
      <ProjectTimelineEffectLaneLabelRows
        compactRows={false}
        onClearUtilityLane={props.onClearUtilityLane}
        cursorLaneVisible={props.cursorLaneVisible}
        project={props.project}
        onAddMotionRegion={props.onAddMotionRegion}
        onToggleUtilityLaneLock={props.onToggleUtilityLaneLock}
        onToggleUtilityLaneVisibility={props.onToggleUtilityLaneVisibility}
      />
    </div>
  );
}

function getTrackPositionLabel(tracks: VideoProject['tracks'], trackIndex: number): string {
  const track = tracks[trackIndex];
  if (!track) return '';
  if (track.role === VideoProjectTrackRole.CAMERA) {
    const cameraPosition = tracks
      .slice(0, trackIndex + 1)
      .filter((item) => item.role === VideoProjectTrackRole.CAMERA).length;
    return `C${cameraPosition}`;
  }
  const position = tracks
    .slice(0, trackIndex + 1)
    .filter(
      (item) =>
        item.kind === track.kind &&
        (track.kind !== VideoTrackKind.PRIMARY || item.role !== VideoProjectTrackRole.CAMERA)
    ).length;
  const prefix = {
    [VideoTrackKind.PRIMARY]: 'V',
    [VideoTrackKind.AUDIO]: 'A',
    [VideoTrackKind.OVERLAY]: 'O',
    [VideoTrackKind.SUBTITLE]: 'S',
  }[track.kind];
  return `${prefix}${position}`;
}
