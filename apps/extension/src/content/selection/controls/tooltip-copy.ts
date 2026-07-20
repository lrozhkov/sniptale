import { translate } from '../../../platform/i18n';
import type { ContentSizeTooltipCopy } from '@sniptale/ui/content-size-tooltip/core';

type OverlayTooltipConfirmKey =
  | 'content.overlayControls.regionConfirm'
  | 'content.overlayControls.save';

export function getOverlayControlsTooltipCopy(
  confirmKey: OverlayTooltipConfirmKey
): ContentSizeTooltipCopy {
  return {
    widthField: translate('content.overlayControls.widthField'),
    heightField: translate('content.overlayControls.heightField'),
    decreaseWidth: translate('content.overlayControls.decreaseWidth'),
    increaseWidth: translate('content.overlayControls.increaseWidth'),
    decreaseHeight: translate('content.overlayControls.decreaseHeight'),
    increaseHeight: translate('content.overlayControls.increaseHeight'),
    keepAspectRatio: translate('content.overlayControls.keepAspectRatioTitle'),
    cancel: translate('content.overlayControls.cancel'),
    confirm: translate(confirmKey),
  };
}

export function getOverlayControlsRegionConfirmTooltipCopy(): ContentSizeTooltipCopy {
  return getOverlayControlsTooltipCopy('content.overlayControls.regionConfirm');
}

export function getOverlayControlsSaveTooltipCopy(): ContentSizeTooltipCopy {
  return getOverlayControlsTooltipCopy('content.overlayControls.save');
}
