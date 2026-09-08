import { translate } from '../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { getVideoProjectUtilityLanes } from '../../../../../features/video/project/utility-lanes';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { InspectorGroupedPanel } from '../grouped-inspector';
import { SelectionEmptyState } from './helpers';
import {
  MotionBehaviorFields,
  MotionCameraFields,
  MotionOverview,
  MotionTimingFields,
} from '../motion/content';
import { PANEL_SECTION_CLASS_NAME } from '../shared/panel';
import { VideoEditorSelectionKind } from '../../../../contracts/selection';
import { resolveMotionConnectionSource } from '../../../../../features/video/project/motion';
import { SelectInput } from '../shared/controls';
import { getTemporalEasingOptions } from '../effect-controls/options';

export function InspectMotionConnectionPanel(props: WorkspaceSidebarSelectionPanelProps) {
  const selection = props.selection;
  const destination =
    selection.kind === VideoEditorSelectionKind.MOTION_CONNECTION
      ? props.project.motionRegions?.find((region) => region.id === selection.motionRegionId)
      : null;
  if (
    !destination?.incomingConnection ||
    !resolveMotionConnectionSource(props.project, destination)
  )
    return <SelectionEmptyState />;
  const connection = destination.incomingConnection;
  const locked = getVideoProjectUtilityLanes(props.project).camera.locked;
  return (
    <section className={PANEL_SECTION_CLASS_NAME}>
      <MotionInspectorFieldset locked={locked}>
        <SelectInput
          label={translate('videoEditor.sidebar.motionEasingLabel')}
          value={connection.easing}
          options={getTemporalEasingOptions()}
          onChange={(easing) =>
            props.onUpdateMotionRegion(destination.id, {
              incomingConnection: { ...connection, easing },
            })
          }
        />
        <ProductActionButton
          compact
          tone="danger"
          className="mt-3"
          onClick={() => props.onUpdateMotionRegion(destination.id, { incomingConnection: null })}
        >
          {translate('videoEditor.timeline.disconnectFraming')}
        </ProductActionButton>
      </MotionInspectorFieldset>
    </section>
  );
}

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
            semantic: 'info' as const,
            label: translate('videoEditor.sidebar.inspectorGroupInfo'),
            content: (
              <MotionInspectorFieldset locked={isLocked}>
                <MotionOverview motionRegion={motionRegion} />
              </MotionInspectorFieldset>
            ),
          },
          {
            id: 'zoom',
            semantic: 'framing' as const,
            label: translate('videoEditor.sidebar.inspectorGroupFraming'),
            defaultActive: true,
            content: (
              <MotionInspectorFieldset locked={isLocked}>
                <MotionCameraFields motionRegion={motionRegion} panel={props} />
              </MotionInspectorFieldset>
            ),
          },
          {
            id: 'timing',
            semantic: 'timing' as const,
            label: translate('videoEditor.sidebar.inspectorGroupTiming'),
            content: (
              <MotionInspectorFieldset locked={isLocked}>
                <MotionTimingFields motionRegion={motionRegion} panel={props} />
              </MotionInspectorFieldset>
            ),
          },
          {
            id: 'behavior',
            semantic: 'animation' as const,
            label: translate('videoEditor.sidebar.inspectorGroupAnimation'),
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
        className="mt-3"
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
