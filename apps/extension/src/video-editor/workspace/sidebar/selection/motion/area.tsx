import { translate } from '../../../../../platform/i18n';
import { VideoMotionFocusMode } from '../../../../../features/video/project/types';
import type { VideoProjectMotionArea } from '../../../../../features/video/project/types';
import { VideoEditorPlacementModeKind } from '../../../../contracts/placement';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { MotionAreaBoundsFields } from './area-controls';
import { MotionPlacementButtonGroup } from './placement-buttons';
import { getDefaultFocusArea } from './utils';

function MotionAreaCoordinateSection(props: {
  focusArea: VideoProjectMotionArea | null | undefined;
  motionRegionId: string;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  const area = props.focusArea ?? getDefaultFocusArea(props.panel);
  const updateArea = (patch: Partial<VideoProjectMotionArea>) => {
    props.panel.onUpdateMotionRegion(props.motionRegionId, {
      focusArea: { ...area, ...patch },
    });
  };

  return (
    <div className="space-y-3">
      <MotionAreaBoundsFields area={area} onUpdateArea={updateArea} panel={props.panel} />
    </div>
  );
}

function MotionAreaButtons(props: {
  isPickingOnStage: boolean;
  motionRegionId: string;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <MotionPlacementButtonGroup
      isPickingOnStage={props.isPickingOnStage}
      pickLabel={translate('videoEditor.sidebar.selectAreaOnStage')}
      resetLabel={translate('videoEditor.sidebar.resetAreaToCenter')}
      onPick={() => {
        props.panel.onUpdateMotionRegion(props.motionRegionId, {
          focusArea: getDefaultFocusArea(props.panel),
          focusMode: VideoMotionFocusMode.MANUAL_AREA,
        });
        props.panel.onStartMotionAreaPlacement(props.motionRegionId);
      }}
      onReset={() => {
        props.panel.onClearPlacementMode();
        props.panel.onUpdateMotionRegion(props.motionRegionId, {
          focusArea: getDefaultFocusArea(props.panel),
          focusMode: VideoMotionFocusMode.MANUAL_AREA,
        });
      }}
    />
  );
}

export function ManualAreaFields(props: {
  motionRegionId: string;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  const focusArea = props.panel.selectedMotionRegion?.focusArea;
  const isPickingOnStage =
    props.panel.placementMode?.kind === VideoEditorPlacementModeKind.MOTION_AREA &&
    props.panel.placementMode.motionRegionId === props.motionRegionId;

  return (
    <div className="grid grid-cols-1 gap-3">
      <MotionAreaCoordinateSection
        focusArea={focusArea}
        motionRegionId={props.motionRegionId}
        panel={props.panel}
      />
      <MotionAreaButtons
        isPickingOnStage={isPickingOnStage}
        motionRegionId={props.motionRegionId}
        panel={props.panel}
      />
    </div>
  );
}
