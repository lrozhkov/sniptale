import { translate } from '../../../../../platform/i18n';
import { VideoMotionFocusMode } from '../../../../../features/video/project/types';
import { VideoEditorPlacementModeKind } from '../../../../contracts/placement';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { NumberInput } from '../inputs/number';
import { MotionPlacementButtonGroup } from './placement-buttons';
import { getProjectCenter } from './utils';

function MotionFocusCoordinateFields(props: {
  focusPoint: { x: number; y: number } | null | undefined;
  motionRegionId: string;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <div className="space-y-3">
      <NumberInput
        label={translate('videoEditor.sidebar.motionFocusXLabel')}
        value={props.focusPoint?.x ?? props.panel.project.width / 2}
        min={0}
        max={props.panel.project.width}
        step={1}
        onChange={(value) =>
          props.panel.onUpdateMotionRegion(props.motionRegionId, {
            focusPoint: {
              x: value,
              y: props.focusPoint?.y ?? props.panel.project.height / 2,
            },
          })
        }
      />
      <NumberInput
        label={translate('videoEditor.sidebar.motionFocusYLabel')}
        value={props.focusPoint?.y ?? props.panel.project.height / 2}
        min={0}
        max={props.panel.project.height}
        step={1}
        onChange={(value) =>
          props.panel.onUpdateMotionRegion(props.motionRegionId, {
            focusPoint: {
              x: props.focusPoint?.x ?? props.panel.project.width / 2,
              y: value,
            },
          })
        }
      />
    </div>
  );
}

function MotionFocusButtons(props: {
  isPickingOnStage: boolean;
  motionRegionId: string;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <MotionPlacementButtonGroup
      isPickingOnStage={props.isPickingOnStage}
      pickLabel={translate('videoEditor.sidebar.selectPointOnStage')}
      resetLabel={translate('videoEditor.sidebar.resetPointToCenter')}
      onPick={() => {
        props.panel.onUpdateMotionRegion(props.motionRegionId, {
          focusMode: VideoMotionFocusMode.MANUAL,
        });
        props.panel.onStartMotionFocusPlacement(props.motionRegionId);
      }}
      onReset={() => {
        props.panel.onClearPlacementMode();
        props.panel.onUpdateMotionRegion(props.motionRegionId, {
          focusMode: VideoMotionFocusMode.MANUAL,
          focusPoint: getProjectCenter(props.panel),
        });
      }}
    />
  );
}

export function ManualFocusFields(props: {
  motionRegionId: string;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  const focusPoint = props.panel.selectedMotionRegion?.focusPoint;
  const isPickingOnStage =
    props.panel.placementMode?.kind === VideoEditorPlacementModeKind.MOTION_FOCUS &&
    props.panel.placementMode.motionRegionId === props.motionRegionId;

  return (
    <div className="grid grid-cols-1 gap-3">
      <MotionFocusCoordinateFields
        focusPoint={focusPoint}
        motionRegionId={props.motionRegionId}
        panel={props.panel}
      />
      <MotionFocusButtons
        isPickingOnStage={isPickingOnStage}
        motionRegionId={props.motionRegionId}
        panel={props.panel}
      />
    </div>
  );
}
