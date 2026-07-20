import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { VideoEditorTrackHeightMultiplier } from '../../../persistence/track-panel';
import { CompactRange } from '../../../../ui/compact-inspector-controls';
import {
  getVideoProjectUtilityLanes,
  type VideoProjectUtilityLaneKind,
} from '../../../../features/video/project/utility-lanes';
import type { VideoProject } from '../../../../features/video/project/types';
import { EFFECT_LANE_ROW_HEIGHT, TELEMETRY_LANE_ROW_HEIGHT } from '../interaction-state/helpers';
import { TimelineIconButton } from '../controls/icon-button';
import type { TimelineTrackLayoutModel } from '../tracks/layout';
import { UtilityLaneControlRow, UtilityProjectLaneControlRow } from './utility';
import type { useProjectTimelinePanelPrefs } from './prefs';

export function ProjectTimelineExpandedRows(props: {
  trackLayoutModel: TimelineTrackLayoutModel;
  trackPanelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
  project: VideoProject;
  tracks: VideoProject['tracks'];
  onClearUtilityLane: (lane: VideoProjectUtilityLaneKind) => void;
  onDeleteTrack: (trackId: string) => void;
  onMoveTrack: (trackId: string, direction: 'up' | 'down') => void;
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
}) {
  return (
    <div className="min-w-0 bg-[color:var(--sniptale-color-surface-panel)]">
      <UtilityLaneControlRow
        label={translate('videoEditor.timeline.telemetryLane')}
        rowHeight={TELEMETRY_LANE_ROW_HEIGHT}
        visible={props.trackPanelPrefs.prefs.collapsedTelemetryLaneVisible}
        onVisibleChange={props.trackPanelPrefs.setCollapsedTelemetryLaneVisible}
      />
      {props.tracks.map((track, index) => (
        <ProjectTrackControlRow
          key={track.id}
          height={props.trackLayoutModel.layoutByTrackId.get(track.id)?.rowHeight}
          index={index}
          track={track}
          trackHeight={props.trackPanelPrefs.prefs.trackHeightByTrackId[track.id] ?? 1}
          tracksCount={props.tracks.length}
          onDeleteTrack={props.onDeleteTrack}
          onMoveTrack={props.onMoveTrack}
          onTrackHeightChange={props.trackPanelPrefs.setTrackHeight}
        />
      ))}
      <ProjectTimelineExpandedEffectRows
        project={props.project}
        trackPanelPrefs={props.trackPanelPrefs}
        onClearUtilityLane={props.onClearUtilityLane}
        onToggleUtilityLaneLock={props.onToggleUtilityLaneLock}
        onToggleUtilityLaneVisibility={props.onToggleUtilityLaneVisibility}
      />
    </div>
  );
}

function ProjectTimelineExpandedEffectRows(props: {
  project: VideoProject;
  trackPanelPrefs: ReturnType<typeof useProjectTimelinePanelPrefs>;
  onClearUtilityLane: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
}) {
  const utilityLanes = getVideoProjectUtilityLanes(props.project);

  return (
    <>
      <UtilityLaneControlRow
        label={translate('videoEditor.timeline.cursorLane')}
        rowHeight={EFFECT_LANE_ROW_HEIGHT}
        visible={props.trackPanelPrefs.prefs.collapsedCursorLaneVisible}
        onVisibleChange={props.trackPanelPrefs.setCollapsedCursorLaneVisible}
      />
      <UtilityProjectLaneControlRow
        height={EFFECT_LANE_ROW_HEIGHT}
        label={translate('videoEditor.timeline.actionsLane')}
        lane="actions"
        state={utilityLanes.actions}
        onClearUtilityLane={props.onClearUtilityLane}
        onToggleUtilityLaneLock={props.onToggleUtilityLaneLock}
        onToggleUtilityLaneVisibility={props.onToggleUtilityLaneVisibility}
      />
      <UtilityProjectLaneControlRow
        height={EFFECT_LANE_ROW_HEIGHT}
        label={translate('videoEditor.timeline.motionLane')}
        lane="camera"
        state={utilityLanes.camera}
        onClearUtilityLane={props.onClearUtilityLane}
        onToggleUtilityLaneLock={props.onToggleUtilityLaneLock}
        onToggleUtilityLaneVisibility={props.onToggleUtilityLaneVisibility}
      />
    </>
  );
}

function ProjectTrackControlRow(props: {
  height: number | undefined;
  index: number;
  track: VideoProject['tracks'][number];
  trackHeight: VideoEditorTrackHeightMultiplier;
  tracksCount: number;
  onDeleteTrack: (trackId: string) => void;
  onMoveTrack: (trackId: string, direction: 'up' | 'down') => void;
  onTrackHeightChange: (trackId: string, multiplier: VideoEditorTrackHeightMultiplier) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 border-b border-[color:var(--sniptale-color-border-subtle)] px-3"
      style={{ height: props.height }}
    >
      <ProjectTrackOrderControls {...props} />
      <ProjectTrackHeightSlider
        track={props.track}
        trackHeight={props.trackHeight}
        onTrackHeightChange={props.onTrackHeightChange}
      />
      <TimelineIconButton
        disabled={props.track.isRoot}
        icon={<Trash2 size={13} strokeWidth={2.2} />}
        title={translate('videoEditor.timeline.deleteTrackTitle')}
        onClick={() => props.onDeleteTrack(props.track.id)}
      />
    </div>
  );
}

function ProjectTrackOrderControls(props: {
  index: number;
  track: VideoProject['tracks'][number];
  tracksCount: number;
  onMoveTrack: (trackId: string, direction: 'up' | 'down') => void;
}) {
  return (
    <div className="flex gap-1">
      <TimelineIconButton
        disabled={props.index === 0}
        icon={<ChevronUp size={13} strokeWidth={2.2} />}
        title={translate('videoEditor.timeline.moveTrackUp')}
        onClick={() => props.onMoveTrack(props.track.id, 'up')}
      />
      <TimelineIconButton
        disabled={props.index === props.tracksCount - 1}
        icon={<ChevronDown size={13} strokeWidth={2.2} />}
        title={translate('videoEditor.timeline.moveTrackDown')}
        onClick={() => props.onMoveTrack(props.track.id, 'down')}
      />
    </div>
  );
}

function ProjectTrackHeightSlider(props: {
  track: VideoProject['tracks'][number];
  trackHeight: VideoEditorTrackHeightMultiplier;
  onTrackHeightChange: (trackId: string, multiplier: VideoEditorTrackHeightMultiplier) => void;
}) {
  return (
    <label className="flex w-28 shrink-0 items-center gap-2 text-[11px] text-[var(--sniptale-color-text-muted)]">
      <span className="w-8 tabular-nums">{`${props.trackHeight.toFixed(2)}x`}</span>
      <CompactRange
        className="min-w-0 flex-1"
        type="range"
        data-ui="video-editor.timeline.track-height"
        aria-label={translate('videoEditor.timeline.trackHeight')}
        min={0.5}
        max={3}
        step={0.25}
        value={props.trackHeight}
        onChange={(event) => props.onTrackHeightChange(props.track.id, Number(event.target.value))}
      />
    </label>
  );
}
