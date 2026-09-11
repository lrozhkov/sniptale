import { translate } from '../../../../../platform/i18n';
import type { GlassSelectOption } from '../../../../../ui/glass-select';
import {
  VideoMotionOverlayZoomMode,
  VideoProjectActionPreset,
  VideoTemporalEasing,
} from '../../../../../features/video/project/types';

export function getTemporalEasingOptions() {
  const options: GlassSelectOption<VideoTemporalEasing>[] = [
    {
      value: VideoTemporalEasing.LINEAR,
      label: translate('videoEditor.sidebar.temporalEasingLinear'),
    },
    {
      value: VideoTemporalEasing.EASE_OUT,
      label: translate('videoEditor.sidebar.temporalEasingEaseOut'),
    },
    {
      value: VideoTemporalEasing.EASE_IN_OUT,
      label: translate('videoEditor.sidebar.temporalEasingEaseInOut'),
    },
    {
      value: VideoTemporalEasing.INSTANT,
      label: translate('videoEditor.sidebar.temporalEasingInstant'),
    },
  ];
  return options;
}

export function getActionPresetOptions() {
  const options: GlassSelectOption<VideoProjectActionPreset>[] = [
    {
      value: VideoProjectActionPreset.NONE,
      label: translate('videoEditor.sidebar.actionPresetNone'),
    },
    {
      value: VideoProjectActionPreset.CLICK_RIPPLE,
      label: translate('videoEditor.sidebar.actionPresetClickRipple'),
    },
    {
      value: VideoProjectActionPreset.SPOTLIGHT,
      label: translate('videoEditor.sidebar.actionPresetSpotlight'),
    },
    {
      value: VideoProjectActionPreset.CLICK_PRESS,
      label: translate('videoEditor.sidebar.actionPresetPress'),
    },
  ];
  return options;
}

export function getMotionOverlayZoomModeOptions() {
  return [
    {
      value: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      label: translate('videoEditor.sidebar.motionOverlayZoomLock'),
    },
    {
      value: VideoMotionOverlayZoomMode.FOLLOW_CAMERA,
      label: translate('videoEditor.sidebar.motionOverlayZoomFollowCamera'),
    },
  ] as const;
}
