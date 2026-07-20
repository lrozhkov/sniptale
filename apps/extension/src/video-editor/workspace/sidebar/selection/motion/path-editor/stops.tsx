import { translate } from '../../../../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { VideoMotionPathTargetKind } from '../../../../../../features/video/project/types';
import type { VideoProjectMotionPathStop } from '../../../../../../features/video/project/types';
import { VideoEditorPlacementModeKind } from '../../../../../contracts/placement';
import { NumberInput } from '../../inputs/number';
import { MotionPathPlacementButton } from './placement-button';
import {
  duplicateStop,
  removeStop,
  updateAreaStop,
  updatePointStop,
  updateTargetKind,
} from './stop-patches';
import { createStopLabel, type MotionPathEditorProps, PATH_CARD_CLASS_NAME } from './shared';
import { MotionAreaBoundsFields } from '../area-controls';
import { OptionButtonsField } from '../../shared/option-buttons';
import { DetailItem, DetailList, PANEL_META_CLASS_NAME } from '../../shared/panel';
import { SliderField } from '../../shared/sliders';

export function MotionPathStopSection(
  props: MotionPathEditorProps & { index: number; stop: VideoProjectMotionPathStop }
) {
  return (
    <section className={PATH_CARD_CLASS_NAME}>
      <MotionPathStopHeader {...props} />
      <MotionPathTargetKindField {...props} />
      {props.stop.target.kind === VideoMotionPathTargetKind.POINT ? (
        <MotionPathPointFields {...props} />
      ) : (
        <MotionPathAreaFields {...props} />
      )}
    </section>
  );
}

function MotionPathStopHeader(
  props: MotionPathEditorProps & { index: number; stop: VideoProjectMotionPathStop }
) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className={PANEL_META_CLASS_NAME}>{createStopLabel(props.index)}</p>
        <div className="flex flex-wrap gap-2">
          <ProductActionButton compact tone="secondary" onClick={() => duplicateStop(props)}>
            {translate('videoEditor.sidebar.motionPathDuplicateStop')}
          </ProductActionButton>
          <ProductActionButton
            compact
            tone="secondary"
            disabled={props.path.stops.length <= 2}
            onClick={() => removeStop(props)}
          >
            {translate('videoEditor.sidebar.motionPathDeleteStop')}
          </ProductActionButton>
        </div>
      </div>
      <DetailList>
        <DetailItem
          label={translate('videoEditor.sidebar.motionPathTimeline')}
          value={`${Math.round(props.stop.offset * 100)}%`}
        />
      </DetailList>
    </div>
  );
}

function MotionPathTargetKindField(
  props: MotionPathEditorProps & { stop: VideoProjectMotionPathStop }
) {
  return (
    <OptionButtonsField
      label={translate('videoEditor.sidebar.motionPathTargetLabel')}
      value={props.stop.target.kind}
      onChange={(value) => updateTargetKind(props, value)}
      options={[
        {
          label: translate('videoEditor.sidebar.motionPathTargetPoint'),
          value: VideoMotionPathTargetKind.POINT,
        },
        {
          label: translate('videoEditor.sidebar.motionPathTargetArea'),
          value: VideoMotionPathTargetKind.AREA,
        },
      ]}
    />
  );
}

function MotionPathPointFields(
  props: MotionPathEditorProps & { stop: VideoProjectMotionPathStop }
) {
  if (props.stop.target.kind !== VideoMotionPathTargetKind.POINT) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <NumberInput
        label={translate('videoEditor.sidebar.motionFocusXLabel')}
        value={props.stop.target.x}
        min={0}
        max={props.panel.project.width}
        step={1}
        onChange={(value) => updatePointStop(props, { x: value })}
      />
      <NumberInput
        label={translate('videoEditor.sidebar.motionFocusYLabel')}
        value={props.stop.target.y}
        min={0}
        max={props.panel.project.height}
        step={1}
        onChange={(value) => updatePointStop(props, { y: value })}
      />
      <SliderField
        label={translate('videoEditor.sidebar.motionScaleLabel')}
        value={props.stop.target.scale}
        min={1}
        max={4}
        step={0.05}
        onChange={(value) => updatePointStop(props, { scale: value })}
        formatValue={(value) => `${Math.round(value * 100)}%`}
      />
      <MotionPathPlacementButton
        active={
          props.panel.placementMode?.kind === VideoEditorPlacementModeKind.MOTION_PATH_STOP_POINT &&
          props.panel.placementMode.motionRegionId === props.motionRegion.id &&
          props.panel.placementMode.stopId === props.stop.id
        }
        label={translate('videoEditor.sidebar.motionPathPickStopPoint')}
        onClick={() =>
          props.panel.onStartMotionPathStopPointPlacement?.(props.motionRegion.id, props.stop.id)
        }
      />
    </div>
  );
}

function MotionPathAreaFields(props: MotionPathEditorProps & { stop: VideoProjectMotionPathStop }) {
  if (props.stop.target.kind !== VideoMotionPathTargetKind.AREA) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <MotionAreaBoundsFields
        area={props.stop.target}
        onUpdateArea={(patch) => updateAreaStop(props, patch)}
        panel={props.panel}
      />
      <MotionPathAreaPlacementControl {...props} />
    </div>
  );
}

function MotionPathAreaPlacementControl(
  props: MotionPathEditorProps & { stop: VideoProjectMotionPathStop }
) {
  return (
    <MotionPathPlacementButton
      active={
        props.panel.placementMode?.kind === VideoEditorPlacementModeKind.MOTION_PATH_STOP_AREA &&
        props.panel.placementMode.motionRegionId === props.motionRegion.id &&
        props.panel.placementMode.stopId === props.stop.id
      }
      label={translate('videoEditor.sidebar.motionPathPickStopArea')}
      onClick={() =>
        props.panel.onStartMotionPathStopAreaPlacement?.(props.motionRegion.id, props.stop.id)
      }
    />
  );
}
