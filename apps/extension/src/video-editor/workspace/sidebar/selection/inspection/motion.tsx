import { isCameraMotionRegion } from '../../../../../features/video/project/motion/normalization';
import {
  MotionEffectModeField,
  MotionFocusFields,
  MotionFocusAnimationFields,
} from '../motion/appearance';
import {
  MotionPerspectiveFields,
  MotionDepthFields,
  MotionSpatialReferenceFields,
} from '../motion/spatial';
import { MotionBlurField } from '../motion/fields';
import { translate } from '../../../../../platform/i18n';
import { InspectorActionButton } from '../shared/actions';
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
  const source = resolveMotionConnectionSource(props.project, destination)!;
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
        {isCameraMotionRegion(source) ? (
          <MotionBlurField motionRegion={source} phase="link" panel={props} />
        ) : null}
        <InspectorActionButton
          compact
          tone="danger"
          separated
          onClick={() => props.onUpdateMotionRegion(destination.id, { incomingConnection: null })}
        >
          {translate(
            source.spotlight
              ? 'videoEditor.sidebar.disconnectSpotlight'
              : 'videoEditor.timeline.disconnectFraming'
          )}
        </InspectorActionButton>
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
            semantic: isCameraMotionRegion(motionRegion)
              ? ('framing' as const)
              : ('appearance' as const),
            label: translate(
              !isCameraMotionRegion(motionRegion)
                ? 'videoEditor.sidebar.inspectorGroupAppearance'
                : 'videoEditor.sidebar.inspectorGroupFraming'
            ),
            defaultActive: true,
            content: (
              <MotionInspectorFieldset locked={isLocked}>
                <div className="sniptale-parameter-stack">
                  <MotionEffectModeField motionRegion={motionRegion} panel={props} />
                  {!isCameraMotionRegion(motionRegion) ? (
                    <MotionFocusFields motionRegion={motionRegion} panel={props} />
                  ) : (
                    <MotionCameraFields motionRegion={motionRegion} panel={props} />
                  )}
                </div>
              </MotionInspectorFieldset>
            ),
          },
          {
            id: 'perspective',
            visible: isCameraMotionRegion(motionRegion),
            semantic: 'perspective' as const,
            label: translate('gallery.videoReview.perspective'),
            content: (
              <MotionInspectorFieldset locked={isLocked}>
                <MotionPerspectiveFields motionRegion={motionRegion} panel={props} />
              </MotionInspectorFieldset>
            ),
          },
          {
            id: 'depth',
            visible: isCameraMotionRegion(motionRegion),
            semantic: 'depth' as const,
            label: translate('gallery.videoReview.depthOfField'),
            content: (
              <MotionInspectorFieldset locked={isLocked}>
                <MotionDepthFields motionRegion={motionRegion} panel={props} />
              </MotionInspectorFieldset>
            ),
          },
          {
            id: 'spatial-reference',
            visible: isCameraMotionRegion(motionRegion),
            semantic: 'framing' as const,
            label: translate('videoEditor.sidebar.inspectorGroupSpatialReference'),
            content: (
              <MotionInspectorFieldset locked={isLocked}>
                <MotionSpatialReferenceFields motionRegion={motionRegion} panel={props} />
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
                {!isCameraMotionRegion(motionRegion) ? (
                  <MotionFocusAnimationFields motionRegion={motionRegion} panel={props} />
                ) : (
                  <MotionBehaviorFields motionRegion={motionRegion} panel={props} />
                )}
              </MotionInspectorFieldset>
            ),
          },
        ]}
      />
      <InspectorActionButton
        compact
        disabled={isLocked}
        tone="danger"
        separated
        onClick={() => props.onDeleteMotionRegion(motionRegion.id)}
      >
        {translate('common.actions.delete')}
      </InspectorActionButton>
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
