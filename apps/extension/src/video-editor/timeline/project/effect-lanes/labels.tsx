import { getTimelineUtilityRowPresence } from './segments';
import { Eye, EyeOff, Lock, Plus, Unlock, Trash2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import type { VideoProjectUtilityLaneKind } from '../../../../features/video/project/utility-lanes';
import { VideoProjectActionPreset } from '../../../../features/video/project/types';
import type { VideoProjectUtilityLanes } from '../../../../features/video/project/types';
import type { VideoProject } from '../../../../features/video/project/types';
import { ProjectTimelineEffectLaneLabelRow } from './ui';
import { getCursorLaneIcon, getUtilityLaneIcon } from '../tracks/lane-icons';
import { TimelineIconButton } from '../controls/icon-button';

export function ProjectTimelineEffectLaneLabelRows({
  compactRows,
  cursorLaneVisible,
  onToggleUtilityLaneLock,
  onClearUtilityLane,
  onToggleUtilityLaneVisibility,
  onAddMotionRegion,
  onSelectMotionLane,
  motionLaneSelected,
  project,
}: {
  compactRows: boolean;
  cursorLaneVisible: boolean;
  onClearUtilityLane: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
  onAddMotionRegion: () => void;
  onSelectMotionLane?: (() => void) | undefined;
  motionLaneSelected?: boolean | undefined;
  project: VideoProject;
}) {
  const utilityLanes = getVideoProjectUtilityLanes(project);
  const rows = getTimelineUtilityRowPresence(project);

  return (
    <>
      <ProjectTimelineCoreLaneLabelRows
        compactRows={compactRows}
        cursorLaneVisible={cursorLaneVisible}
        project={project}
      />
      {rows.actions ? (
        <ProjectTimelineUtilityLaneLabelRow
          compactRows={compactRows}
          label={translate('videoEditor.timeline.actionsLane')}
          lane="actions"
          state={utilityLanes.actions}
          onClearUtilityLane={onClearUtilityLane}
          onToggleUtilityLaneLock={onToggleUtilityLaneLock}
          onToggleUtilityLaneVisibility={onToggleUtilityLaneVisibility}
        />
      ) : null}
      {rows.motion ? (
        <ProjectTimelineUtilityLaneLabelRow
          compactRows={compactRows}
          label={translate('videoEditor.timeline.motionLane')}
          lane="camera"
          onSelect={onSelectMotionLane}
          isSelected={motionLaneSelected}
          state={utilityLanes.camera}
          onAdd={() => onAddMotionRegion()}
          onClearUtilityLane={onClearUtilityLane}
          onToggleUtilityLaneLock={onToggleUtilityLaneLock}
          onToggleUtilityLaneVisibility={onToggleUtilityLaneVisibility}
        />
      ) : null}
    </>
  );
}

function ProjectTimelineCoreLaneLabelRows(props: {
  compactRows: boolean;
  cursorLaneVisible: boolean;
  project: VideoProject;
}) {
  return (
    <>
      {props.cursorLaneVisible ? (
        <ProjectTimelineEffectLaneLabelRow
          compactRows={props.compactRows}
          icon={getCursorLaneIcon()}
          title={translate('videoEditor.timeline.cursorLane')}
        />
      ) : null}
    </>
  );
}

function ProjectTimelineUtilityLaneLabelRow(props: {
  compactRows: boolean;
  label: string;
  onSelect?: (() => void) | undefined;
  isSelected?: boolean | undefined;
  lane: VideoProjectUtilityLaneKind;
  state: VideoProjectUtilityLanes[VideoProjectUtilityLaneKind];
  onAdd?: (() => void) | undefined;
  onClearUtilityLane: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
}) {
  return (
    <ProjectTimelineEffectLaneLabelRow
      compactRows={props.compactRows}
      icon={getUtilityLaneIcon(props.lane)}
      title={props.label}
      onSelect={props.onSelect}
      isSelected={props.isSelected}
      trailingControls={
        <UtilityLaneStateControls
          lane={props.lane}
          state={props.state}
          onClearUtilityLane={props.onClearUtilityLane}
          onToggleUtilityLaneLock={props.onToggleUtilityLaneLock}
          onToggleUtilityLaneVisibility={props.onToggleUtilityLaneVisibility}
          {...(props.onAdd ? { onAdd: props.onAdd } : {})}
        />
      }
    />
  );
}

function UtilityLaneStateControls(props: {
  lane: VideoProjectUtilityLaneKind;
  state: VideoProjectUtilityLanes[VideoProjectUtilityLaneKind];
  onAdd?: (() => void) | undefined;
  onClearUtilityLane: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
}) {
  return (
    <>
      {props.onAdd ? (
        <TimelineIconButton
          dataUi="video-editor.timeline.add-zoom"
          disabled={!props.state.visible || props.state.locked}
          icon={<Plus size={13} strokeWidth={2.2} />}
          title={translate('videoEditor.timeline.addZoomRegion')}
          onClick={props.onAdd}
          stopPropagation
        />
      ) : null}
      <TimelineIconButton
        active={props.state.visible}
        dataUi="timeline.utility-lane-state"
        icon={props.state.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        title={
          props.state.visible
            ? translate('videoEditor.timeline.laneVisible')
            : translate('videoEditor.timeline.laneHidden')
        }
        onClick={() => props.onToggleUtilityLaneVisibility(props.lane)}
        stopPropagation
      />
      <TimelineIconButton
        active={props.state.locked}
        dataUi="timeline.utility-lane-state"
        icon={props.state.locked ? <Lock size={13} /> : <Unlock size={13} />}
        title={
          props.state.locked
            ? translate('videoEditor.timeline.laneLocked')
            : translate('videoEditor.timeline.laneEditable')
        }
        onClick={() => props.onToggleUtilityLaneLock(props.lane)}
        stopPropagation
      />
      <TimelineIconButton
        danger
        disabled={props.state.locked}
        dataUi="video-editor.timeline.clear-utility-lane"
        icon={<Trash2 size={13} />}
        title={translate('videoEditor.timeline.clearLane')}
        onClick={() => props.onClearUtilityLane(props.lane)}
        stopPropagation
      />
    </>
  );
}

export function getActionPresetLabel(preset: VideoProjectActionPreset): string {
  switch (preset) {
    case VideoProjectActionPreset.NONE:
      return translate('videoEditor.sidebar.actionPresetNone');
    case VideoProjectActionPreset.CLICK_RIPPLE:
      return translate('videoEditor.sidebar.actionPresetClickRipple');
    case VideoProjectActionPreset.SPOTLIGHT:
      return translate('videoEditor.sidebar.actionPresetSpotlight');
    case VideoProjectActionPreset.DWELL_ZOOM:
      return translate('videoEditor.sidebar.actionPresetDwellZoom');
    case VideoProjectActionPreset.SCROLL_EMPHASIS:
      return translate('videoEditor.sidebar.actionPresetNone');
  }
}
