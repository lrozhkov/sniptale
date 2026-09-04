import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { VideoMotionCameraMode } from '../../../../../features/video/project/types';
import { getVideoProjectUtilityLanes } from '../../../../../features/video/project/utility-lanes';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { SelectionEmptyState } from './helpers';
import {
  MotionBehaviorFields,
  MotionCameraFields,
  MotionOverview,
  MotionPathFields,
  MotionTimingFields,
} from '../motion/content';
import { PANEL_SECTION_CLASS_NAME } from '../shared/panel';

export function InspectMotionPanel(props: WorkspaceSidebarSelectionPanelProps) {
  const motionRegion = props.selectedMotionRegion;
  if (!motionRegion) {
    return <SelectionEmptyState />;
  }
  const isLocked = getVideoProjectUtilityLanes(props.project).camera.locked;

  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel
        groups={[
          {
            id: 'info',
            label: translate('videoEditor.sidebar.inspectorGroupInfo'),
            content: (
              <MotionInspectorFieldset locked={isLocked}>
                <MotionOverview motionRegion={motionRegion} />
              </MotionInspectorFieldset>
            ),
          },
          {
            id: 'zoom',
            label: translate('videoEditor.sidebar.inspectorGroupZoom'),
            defaultActive: true,
            content: (
              <MotionInspectorFieldset locked={isLocked}>
                <MotionCameraFields motionRegion={motionRegion} panel={props} />
              </MotionInspectorFieldset>
            ),
          },
          {
            id: 'timing',
            label: translate('videoEditor.sidebar.inspectorGroupTiming'),
            content: (
              <MotionInspectorFieldset locked={isLocked}>
                <MotionTimingFields motionRegion={motionRegion} panel={props} />
              </MotionInspectorFieldset>
            ),
          },
          {
            id: 'path',
            label: translate('videoEditor.sidebar.inspectorGroupPath'),
            content: (
              <MotionInspectorFieldset locked={isLocked}>
                <MotionPathFields motionRegion={motionRegion} panel={props} />
              </MotionInspectorFieldset>
            ),
            visible: motionRegion.cameraMode === VideoMotionCameraMode.PATH,
          },
          {
            id: 'behavior',
            label: translate('videoEditor.sidebar.inspectorGroupBehavior'),
            content: (
              <MotionInspectorFieldset locked={isLocked}>
                <MotionBehaviorFields motionRegion={motionRegion} panel={props} />
              </MotionInspectorFieldset>
            ),
          },
        ]}
      />
      <ProductActionButton
        compact
        disabled={isLocked}
        tone="danger"
        onClick={() => props.onDeleteMotionRegion(motionRegion.id)}
        className="mt-3 w-full"
      >
        {translate('common.actions.delete')}
      </ProductActionButton>
    </section>
  );
}

function MotionInspectorFieldset(props: React.PropsWithChildren<{ locked: boolean }>) {
  return (
    <fieldset
      className="m-0 min-w-0 border-0 p-0 disabled:cursor-not-allowed disabled:opacity-60"
      data-video-editor-motion-controls="true"
      disabled={props.locked}
    >
      {props.children}
    </fieldset>
  );
}
