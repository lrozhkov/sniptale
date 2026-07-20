import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { VideoMotionCameraMode } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { SelectionEmptyState } from './helpers';
import {
  MotionCameraFields,
  MotionOverview,
  MotionPathFields,
  MotionTargetFields,
} from '../motion/content';
import { PANEL_SECTION_CLASS_NAME } from '../shared/panel';

export function InspectMotionPanel(props: WorkspaceSidebarSelectionPanelProps) {
  const motionRegion = props.selectedMotionRegion;
  if (!motionRegion) {
    return <SelectionEmptyState />;
  }

  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <InspectorGroupedPanel
        groups={[
          {
            id: 'info',
            label: translate('videoEditor.sidebar.inspectorGroupInfo'),
            content: <MotionOverview motionRegion={motionRegion} />,
          },
          {
            id: 'camera',
            label: translate('videoEditor.sidebar.inspectorGroupCamera'),
            defaultActive: true,
            content: <MotionCameraFields motionRegion={motionRegion} panel={props} />,
          },
          {
            id: 'target',
            label: translate('videoEditor.sidebar.inspectorGroupTarget'),
            content: <MotionTargetFields motionRegion={motionRegion} panel={props} />,
            visible: motionRegion.cameraMode !== VideoMotionCameraMode.PATH,
          },
          {
            id: 'path',
            label: translate('videoEditor.sidebar.inspectorGroupPath'),
            content: <MotionPathFields motionRegion={motionRegion} panel={props} />,
            visible: motionRegion.cameraMode === VideoMotionCameraMode.PATH,
          },
        ]}
      />
      <ProductActionButton
        compact
        tone="danger"
        onClick={() => props.onDeleteMotionRegion(motionRegion.id)}
        className="mt-3 w-full"
      >
        {translate('common.actions.delete')}
      </ProductActionButton>
    </section>
  );
}
