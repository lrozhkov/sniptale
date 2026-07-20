import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
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
  onToggleUtilityLaneVisibility,
  project,
}: {
  compactRows: boolean;
  cursorLaneVisible: boolean;
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
  project: VideoProject;
}) {
  const utilityLanes = getVideoProjectUtilityLanes(project);

  return (
    <>
      <ProjectTimelineCoreLaneLabelRows
        compactRows={compactRows}
        cursorLaneVisible={cursorLaneVisible}
        project={project}
      />
      <ProjectTimelineUtilityLaneLabelRow
        compactRows={compactRows}
        label={translate('videoEditor.timeline.actionsLane')}
        lane="actions"
        state={utilityLanes.actions}
        onToggleUtilityLaneLock={onToggleUtilityLaneLock}
        onToggleUtilityLaneVisibility={onToggleUtilityLaneVisibility}
      />
      <ProjectTimelineUtilityLaneLabelRow
        compactRows={compactRows}
        label={translate('videoEditor.timeline.motionLane')}
        lane="camera"
        state={utilityLanes.camera}
        onToggleUtilityLaneLock={onToggleUtilityLaneLock}
        onToggleUtilityLaneVisibility={onToggleUtilityLaneVisibility}
      />
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
  lane: VideoProjectUtilityLaneKind;
  state: VideoProjectUtilityLanes[VideoProjectUtilityLaneKind];
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
}) {
  return (
    <ProjectTimelineEffectLaneLabelRow
      compactRows={props.compactRows}
      icon={getUtilityLaneIcon(props.lane)}
      title={props.label}
      trailingControls={
        <UtilityLaneStateControls
          lane={props.lane}
          state={props.state}
          onToggleUtilityLaneLock={props.onToggleUtilityLaneLock}
          onToggleUtilityLaneVisibility={props.onToggleUtilityLaneVisibility}
        />
      }
    />
  );
}

function UtilityLaneStateControls(props: {
  lane: VideoProjectUtilityLaneKind;
  state: VideoProjectUtilityLanes[VideoProjectUtilityLaneKind];
  onToggleUtilityLaneLock: (lane: VideoProjectUtilityLaneKind) => void;
  onToggleUtilityLaneVisibility: (lane: VideoProjectUtilityLaneKind) => void;
}) {
  return (
    <>
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
