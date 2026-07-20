import { translate } from '../../../../../platform/i18n';
import {
  VideoMotionFocusMode,
  VideoMotionOverlayZoomMode,
} from '../../../../../features/video/project/types';
import type { VideoTemporalEasing } from '../../../../../features/video/project/types';
import { getVisibleProjectActionEvents } from '../../../../project/operations/action-events';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import {
  getMotionOverlayZoomModeOptions,
  getTemporalEasingOptions,
} from '../effect-controls/options';
import { OptionButtonsField } from '../shared/option-buttons';
import { SelectInput } from '../shared/controls';
import { SliderField } from '../shared/sliders';
import { getAreaCenter, getDefaultFocusArea } from './utils';

function handleMotionFocusModeChange(
  panel: WorkspaceSidebarSelectionPanelProps,
  motionRegion: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedMotionRegion']>,
  value: VideoMotionFocusMode
) {
  if (value === VideoMotionFocusMode.MANUAL_AREA) {
    panel.onUpdateMotionRegion(motionRegion.id, {
      focusArea: motionRegion.focusArea ?? getDefaultFocusArea(panel),
      focusMode: value,
    });
    return;
  }

  panel.onUpdateMotionRegion(motionRegion.id, {
    focusMode: value,
    focusPoint:
      value === VideoMotionFocusMode.MANUAL && motionRegion.focusArea
        ? getAreaCenter(motionRegion.focusArea)
        : motionRegion.focusPoint,
  });
}

export function MotionFocusModeField(props: {
  motionRegion: NonNullable<WorkspaceSidebarSelectionPanelProps['selectedMotionRegion']>;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  return (
    <SelectInput
      label={translate('videoEditor.sidebar.motionFocusLabel')}
      value={props.motionRegion.focusMode}
      onChange={(value) => handleMotionFocusModeChange(props.panel, props.motionRegion, value)}
      options={[
        {
          value: VideoMotionFocusMode.MANUAL,
          label: translate('videoEditor.sidebar.motionFocusManual'),
        },
        {
          value: VideoMotionFocusMode.MANUAL_AREA,
          label: translate('videoEditor.sidebar.motionFocusManualArea'),
        },
        {
          value: VideoMotionFocusMode.CURSOR,
          label: translate('videoEditor.sidebar.motionFocusCursor'),
        },
        {
          value: VideoMotionFocusMode.ACTION,
          label: translate('videoEditor.sidebar.motionFocusAction'),
        },
      ]}
    />
  );
}

export function MotionEasingField(props: {
  motionRegionId: string;
  panel: WorkspaceSidebarSelectionPanelProps;
  value: VideoTemporalEasing;
}) {
  return (
    <SelectInput
      label={translate('videoEditor.sidebar.motionEasingLabel')}
      value={props.value}
      onChange={(value) =>
        props.panel.onUpdateMotionRegion(props.motionRegionId, { easing: value })
      }
      options={getTemporalEasingOptions()}
    />
  );
}

export function MotionBlurField(props: {
  motionRegionId: string;
  panel: WorkspaceSidebarSelectionPanelProps;
  value: number;
}) {
  return (
    <SliderField
      label={translate('videoEditor.sidebar.motionBlurLabel')}
      value={props.value}
      min={0}
      max={1}
      step={0.05}
      onChange={(value) =>
        props.panel.onUpdateMotionRegion(props.motionRegionId, { motionBlurAmount: value })
      }
      formatValue={(value) => `${Math.round(value * 100)}%`}
    />
  );
}

export function MotionOverlayZoomField(props: {
  motionRegionId: string;
  panel: WorkspaceSidebarSelectionPanelProps;
  value: VideoMotionOverlayZoomMode | undefined;
}) {
  return (
    <OptionButtonsField
      label={translate('videoEditor.sidebar.motionOverlayZoomLabel')}
      layout="stacked"
      value={props.value ?? VideoMotionOverlayZoomMode.LOCK_OVERLAYS}
      onChange={(value) =>
        props.panel.onUpdateMotionRegion(props.motionRegionId, { overlayZoomMode: value })
      }
      options={getMotionOverlayZoomModeOptions()}
    />
  );
}

export function MotionTargetActionField(props: {
  motionRegionId: string;
  panel: WorkspaceSidebarSelectionPanelProps;
  value: string | null;
}) {
  const actionEvents = getVisibleProjectActionEvents(props.panel.project);

  return (
    <SelectInput
      label={translate('videoEditor.sidebar.motionTargetActionLabel')}
      value={props.value ?? ''}
      onChange={(value) =>
        props.panel.onUpdateMotionRegion(props.motionRegionId, {
          targetActionEventId: value || null,
        })
      }
      options={[
        {
          value: '',
          label: translate('videoEditor.sidebar.motionTargetActionNone'),
        },
        ...actionEvents.map((event) => ({
          value: event.id,
          label: event.label,
        })),
      ]}
    />
  );
}
