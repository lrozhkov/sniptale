import { Trash2 } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';
import { getVideoProjectUtilityLanes } from '../../../../../features/video/project/utility-lanes';
import { InspectorActionButton } from '../shared/actions';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { ToggleField } from '../shared/controls';
import { PANEL_SECTION_CLASS_NAME } from '../shared/panel';

export function InspectMotionLanePanel(
  props: Pick<
    WorkspaceSidebarSelectionPanelProps,
    | 'project'
    | 'onToggleUtilityLaneVisibility'
    | 'onToggleUtilityLaneLock'
    | 'onClearUtilityLane'
    | 'onAddMotionRegion'
  >
) {
  const lane = getVideoProjectUtilityLanes(props.project).camera;
  return (
    <section className={PANEL_SECTION_CLASS_NAME} data-ui="video-editor.inspector.motion-lane">
      <ToggleField
        label={translate('videoEditor.sidebar.trackVisibilityLabel')}
        checked={lane.visible}
        disabled={!props.onToggleUtilityLaneVisibility}
        onChange={() => props.onToggleUtilityLaneVisibility?.('camera')}
      />
      <ToggleField
        label={translate('videoEditor.sidebar.trackLockLabel')}
        checked={lane.locked}
        disabled={!props.onToggleUtilityLaneLock}
        onChange={() => props.onToggleUtilityLaneLock?.('camera')}
      />
      <InspectorActionButton
        compact
        tone="danger"
        separated
        className="mt-3"
        disabled={lane.locked || !props.onClearUtilityLane || !props.project.motionRegions?.length}
        onClick={() => props.onClearUtilityLane?.('camera')}
      >
        <Trash2 size={14} />
        {translate('videoEditor.timeline.clearLane')}
      </InspectorActionButton>
    </section>
  );
}
