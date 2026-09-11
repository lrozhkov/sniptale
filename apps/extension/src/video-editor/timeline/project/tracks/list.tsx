import type { ProjectTimelineProps } from '../types';
import { useEffectDocumentDrag } from '../../../chrome/effect-document-drag';
import { readVideoEditorEffectDocumentDragPayload } from '../../../contracts/effect-document-drag';
import { resolveEffectOwner } from '../../../../features/video/project/effect-instance/owner';
import type { RecordingTelemetryEntry } from '../../../../composition/persistence/recordings/contracts';
import { getTimelineHistoryLayout } from '../effect-lanes/history-layout';
import { Activity, Rows3, Text } from 'lucide-react';
import { TimelineIconButton } from '../controls/icon-button';
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
  onDropEffectDocument?: ProjectTimelineProps['onDropEffectDocument'];
  recordingTelemetry?: readonly RecordingTelemetryEntry[];
  canShowTelemetryLane: boolean;
  cursorLaneVisible: boolean;
  project: VideoProject;
  selectedTrackId: string | null;
  showTelemetryLane: boolean;
  trackLayoutModel: TimelineTrackLayoutModel;
  trackListRef: MutableRefObject<HTMLDivElement | null>;
  trackPanelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
  tracks: VideoProject['tracks'];
  onAddTrack: ProjectTimelineInsertionActions['onAddTrack'];
  onClearUtilityLane: (lane: VideoProjectUtilityLaneKind) => void;
  onScroll: () => void;
  onSelectTrack: (trackId: string) => void;
  onSelectHistoryLane?: (() => void) | undefined;
  historyLaneSelected?: boolean | undefined;
  onSelectMotionLane?: (() => void) | undefined;
  motionLaneSelected?: boolean | undefined;
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
        props.trackPanelPrefs.prefs.hideTrackNames ? '[&_[data-timeline-track-name]]:sr-only' : '',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[color:var(--sniptale-color-surface-overlay)]',
      ].join(' ')}
    >
      <ProjectTimelineTrackListHeader {...props} />
      <ProjectTimelineTrackListScrollArea {...props} />
    </div>
  );
}

function ProjectTimelineTrackListHeader(props: ProjectTimelineTrackListProps) {
  const { drag } = useEffectDocumentDrag();
  const owner = resolveEffectOwner(props.project, { kind: 'video-group' });
  const canDrop = drag?.kind === 'targetEffect' && owner && !owner.locked && owner.duration > 0;
  const collapsed = props.trackPanelPrefs.prefs.hideTrackNames;
  return (
    <div
      onDragOver={(event) => {
        if (canDrop && props.onDropEffectDocument) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(event) => {
        const payload = readVideoEditorEffectDocumentDragPayload(event.dataTransfer);
        if (!canDrop || payload?.kind !== 'targetEffect') return;
        event.preventDefault();
        event.stopPropagation();
        props.onDropEffectDocument?.(payload, { kind: 'video-group' }, 0);
      }}
      className={[
        canDrop ? 'outline outline-1 outline-[var(--sniptale-color-accent)]' : '',
        'flex h-[30px] items-center border-b text-[11px]',
        'justify-between gap-1 px-2',
        'font-semibold',
        'border-[color:var(--sniptale-color-border-soft)]',
        'text-[var(--sniptale-color-text-muted)]',
      ].join(' ')}
    >
      <span className={collapsed ? 'sr-only' : undefined}>
        {translate(
          canDrop ? 'videoEditor.effectsLibrary.wholeVideo' : 'videoEditor.timeline.tracksTitle'
        )}
      </span>
      <div
        className="flex items-center gap-0.5"
        data-ui="video-editor.timeline.track-header-controls"
      >
        <TimelineIconButton
          frameless
          active={props.trackPanelPrefs.prefs.hideTrackNames}
          dataUi="video-editor.timeline.toolbar.hide-track-names"
          icon={<Text size={14} />}
          onClick={() =>
            props.trackPanelPrefs.setHideTrackNames(!props.trackPanelPrefs.prefs.hideTrackNames)
          }
          title={translate('videoEditor.timeline.hideTrackNames')}
        />
        <TimelineIconButton
          frameless
          active={props.trackPanelPrefs.prefs.compactRows}
          dataUi="video-editor.timeline.toolbar.compact-tracks"
          icon={<Rows3 size={14} />}
          onClick={() =>
            props.trackPanelPrefs.setCompactRows(!props.trackPanelPrefs.prefs.compactRows)
          }
          title={translate('videoEditor.timeline.trackPanelCompactToggle')}
        />
        <TimelineIconButton
          frameless
          active={
            props.canShowTelemetryLane && props.trackPanelPrefs.prefs.collapsedTelemetryLaneVisible
          }
          disabled={!props.canShowTelemetryLane}
          dataUi="video-editor.timeline.toolbar.telemetry-lane"
          icon={<Activity size={14} />}
          onClick={() =>
            props.trackPanelPrefs.setCollapsedTelemetryLaneVisible(
              !props.trackPanelPrefs.prefs.collapsedTelemetryLaneVisible
            )
          }
          title={translate('videoEditor.timeline.telemetryLane')}
        />
        <ProjectTimelineAddTrackControl onAddTrack={props.onAddTrack} />
      </div>
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
  onDropEffectDocument?: ProjectTimelineProps['onDropEffectDocument'];
  recordingTelemetry?: readonly RecordingTelemetryEntry[];
  cursorLaneVisible: boolean;
  project: VideoProject;
  selectedTrackId: string | null;
  showTelemetryLane: boolean;
  trackLayoutModel: TimelineTrackLayoutModel;
  trackPanelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
  tracks: VideoProject['tracks'];
  onClearUtilityLane: (lane: VideoProjectUtilityLaneKind) => void;
  onSelectTrack: (trackId: string) => void;
  onSelectHistoryLane?: (() => void) | undefined;
  historyLaneSelected?: boolean | undefined;
  onSelectMotionLane?: (() => void) | undefined;
  motionLaneSelected?: boolean | undefined;
  onToggleTrackLock: (trackId: string) => void;
  onToggleTrackVisibility: (trackId: string) => void;
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
}) {
  return (
    <div className="min-w-0">
      {props.showTelemetryLane ? (
        <ProjectTimelineTelemetryLaneLabelRow
          height={
            getTimelineHistoryLayout(
              props.project,
              props.recordingTelemetry,
              props.cursorLaneVisible
            ).height
          }
          compactRows={false}
          project={props.project}
          onSelect={props.onSelectHistoryLane}
          selected={props.historyLaneSelected}
          onToggleVisibility={() => props.onToggleUtilityLaneVisibility('actions')}
          onToggleLock={() => props.onToggleUtilityLaneLock('actions')}
        />
      ) : null}
      {props.tracks.map((track, index) => (
        <ProjectTimelineTrackRow
          project={props.project}
          onDropEffectDocument={props.onDropEffectDocument}
          onToggleFx={() =>
            props.trackPanelPrefs.setFxCollapsed(
              track.id,
              !(props.trackLayoutModel.layoutByTrackId.get(track.id)?.fxCollapsed ?? false)
            )
          }
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
      {props.trackLayoutModel.videoFx && (
        <div
          style={{ height: props.trackLayoutModel.videoFx.fxHeight }}
          className="border-b border-[var(--sniptale-color-border-soft)] px-3"
        >
          <button
            type="button"
            className="flex h-5 items-center gap-1 text-[11px] text-[var(--sniptale-color-text-muted)]"
            aria-expanded={!props.trackLayoutModel.videoFx.fxCollapsed}
            onClick={() =>
              props.trackPanelPrefs.setFxCollapsed(
                'video-group',
                !props.trackLayoutModel.videoFx?.fxCollapsed
              )
            }
          >
            <span aria-hidden="true">{props.trackLayoutModel.videoFx.fxCollapsed ? '▸' : '▾'}</span>
            {`FX · ${translate('videoEditor.effectsLibrary.wholeVideo')}`}
          </button>
        </div>
      )}
      <ProjectTimelineEffectLaneLabelRows
        onSelectMotionLane={props.onSelectMotionLane}
        motionLaneSelected={props.motionLaneSelected}
        compactRows={false}
        onClearUtilityLane={props.onClearUtilityLane}
        cursorLaneVisible={props.cursorLaneVisible}
        project={props.project}
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
    [VideoTrackKind.SUBTITLE]: 'S',
  }[track.kind];
  return `${prefix}${position}`;
}
