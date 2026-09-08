import { InspectorDetails } from '../shared/details';
import { getMotionBindingCandidates } from '../../../../../features/video/project/motion/source-binding';
import { SelectInput } from '../shared/controls';
import { translate } from '../../../../../platform/i18n';
import { VideoMotionFocusMode } from '../../../../../features/video/project/types';
import type { VideoProjectMotionRegion } from '../../../../../features/video/project/types';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { ManualAreaFields } from './area';
import { MotionFramingPreview } from './framing-preview';
import {
  MotionBlurField,
  MotionEasingField,
  MotionFocusModeField,
  MotionOverlayZoomField,
  MotionTargetActionField,
} from './fields';
import { ManualFocusFields } from './focus';
import { DetailItem, DetailList } from '../shared/panel';
import { SliderField } from '../shared/sliders';

export function MotionCameraFields(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {props.motionRegion.focusMode === VideoMotionFocusMode.MANUAL ||
      props.motionRegion.focusMode === VideoMotionFocusMode.MANUAL_AREA ? (
        <MotionFramingPreview {...props} />
      ) : null}
      <MotionScaleFields motionRegion={props.motionRegion} panel={props.panel} />
      <MotionFocusModeField motionRegion={props.motionRegion} panel={props.panel} />
      <MotionPlacementFields motionRegion={props.motionRegion} panel={props.panel} />
    </div>
  );
}

export function MotionTimingFields(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <MotionBindingField {...props} />
      <MotionDurationField
        duration={props.motionRegion.duration}
        motionRegionId={props.motionRegion.id}
        panel={props.panel}
      />
    </div>
  );
}

function MotionBindingField({
  motionRegion,
  panel,
}: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  const candidates = getMotionBindingCandidates(panel.project, motionRegion);
  const current = panel.project.clips.find(
    (clip) => clip.id === motionRegion.sourceBinding?.clipId
  );
  const clips =
    current && !candidates.some((clip) => clip.id === current.id)
      ? [current, ...candidates]
      : candidates;
  return (
    <SelectInput
      label={translate('videoEditor.sidebar.framingBinding')}
      value={motionRegion.sourceBinding?.clipId ?? ''}
      disabled={motionRegion.duration <= 0}
      onChange={(value) =>
        panel.onUpdateMotionRegion(motionRegion.id, { sourceClipId: value || null })
      }
      options={[
        { value: '', label: translate('videoEditor.sidebar.framingBindingScene') },
        ...clips.map((clip) => ({
          value: clip.id,
          label: `${clip.name} · ${clip.startTime.toFixed(2)} s`,
        })),
      ]}
    />
  );
}

export function MotionBehaviorFields(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <MotionZoomFields motionRegion={props.motionRegion} panel={props.panel} />
      <MotionEasingField
        motionRegionId={props.motionRegion.id}
        panel={props.panel}
        value={props.motionRegion.easing}
      />
      <InspectorDetails label={translate('videoEditor.sidebar.inspectorMoreDetails')}>
        <MotionOverlayZoomField
          motionRegionId={props.motionRegion.id}
          panel={props.panel}
          value={props.motionRegion.overlayZoomMode}
        />
        <MotionBlurField
          motionRegionId={props.motionRegion.id}
          panel={props.panel}
          value={props.motionRegion.motionBlurAmount ?? 0}
        />
      </InspectorDetails>
    </div>
  );
}

function MotionScaleFields(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  if (props.motionRegion.focusMode === VideoMotionFocusMode.MANUAL_AREA) {
    return null;
  }

  return (
    <SliderField
      label={translate('videoEditor.sidebar.motionScaleLabel')}
      value={props.motionRegion.scale}
      min={0.1}
      max={4}
      step={0.05}
      onChange={(value) =>
        props.panel.onUpdateMotionRegion(props.motionRegion.id, { scale: value })
      }
      formatValue={(value) => `${Math.round(value * 100)}%`}
    />
  );
}

function MotionDurationField(props: {
  duration: number;
  motionRegionId: string;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <SliderField
      label={translate('videoEditor.sidebar.motionDurationLabel')}
      value={props.duration}
      min={0.1}
      max={5}
      step={0.05}
      onChange={(value) =>
        props.panel.onUpdateMotionRegion(props.motionRegionId, { duration: value })
      }
      formatValue={(value) => `${value.toFixed(2)} s`}
    />
  );
}

function MotionZoomFields(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <div className="space-y-3">
      <SliderField
        label={translate('videoEditor.sidebar.motionZoomInLabel')}
        value={props.motionRegion.zoomInDuration}
        min={0}
        max={5}
        step={0.05}
        onChange={(value) =>
          props.panel.onUpdateMotionRegion(props.motionRegion.id, { zoomInDuration: value })
        }
        formatValue={(value) => `${value.toFixed(2)} s`}
      />
      <SliderField
        label={translate('videoEditor.sidebar.motionZoomOutLabel')}
        value={props.motionRegion.zoomOutDuration}
        min={0}
        max={5}
        step={0.05}
        onChange={(value) =>
          props.panel.onUpdateMotionRegion(props.motionRegion.id, { zoomOutDuration: value })
        }
        formatValue={(value) => `${value.toFixed(2)} s`}
      />
    </div>
  );
}

function MotionPlacementFields(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  switch (props.motionRegion.focusMode) {
    case VideoMotionFocusMode.MANUAL:
      return <ManualFocusFields motionRegionId={props.motionRegion.id} panel={props.panel} />;
    case VideoMotionFocusMode.MANUAL_AREA:
      return <ManualAreaFields motionRegionId={props.motionRegion.id} panel={props.panel} />;
    case VideoMotionFocusMode.ACTION:
      return (
        <MotionTargetActionField
          motionRegionId={props.motionRegion.id}
          panel={props.panel}
          value={props.motionRegion.targetAction}
        />
      );
    case VideoMotionFocusMode.CURSOR:
      return null;
  }
}

export function MotionOverview(props: { motionRegion: VideoProjectMotionRegion }) {
  return (
    <div className="space-y-3">
      <DetailList>
        <DetailItem
          label={translate('videoEditor.sidebar.motionFocusLabel')}
          value={getMotionFocusModeLabel(props.motionRegion.focusMode)}
        />
        <DetailItem
          label={translate('videoEditor.sidebar.actionTimePrefix')}
          value={`${props.motionRegion.startTime.toFixed(2)} s`}
        />
      </DetailList>
    </div>
  );
}

function getMotionFocusModeLabel(value: VideoMotionFocusMode): string {
  switch (value) {
    case VideoMotionFocusMode.MANUAL:
      return translate('videoEditor.sidebar.motionFocusManual');
    case VideoMotionFocusMode.MANUAL_AREA:
      return translate('videoEditor.sidebar.motionFocusManualArea');
    case VideoMotionFocusMode.CURSOR:
      return translate('videoEditor.sidebar.motionFocusCursor');
    case VideoMotionFocusMode.ACTION:
      return translate('videoEditor.sidebar.motionFocusAction');
  }
}
