import { translate } from '../../../../platform/i18n';
import type { EffectMode } from '../../../../features/highlighter/contracts';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import type { InteractiveFrameToolbarProps } from './types';
import {
  createSharedToolbarClickHandlers,
  dispatchCalloutEnable,
  dispatchStepBadgeEnable,
} from './dispatch';

export function createEffectButtons() {
  return [
    { mode: 'border' as EffectMode, label: translate('content.interactiveFrame.effectBorder') },
    { mode: 'blur' as EffectMode, label: translate('content.interactiveFrame.effectBlur') },
    { mode: 'focus' as EffectMode, label: translate('content.interactiveFrame.effectFocus') },
  ];
}

export function createToolbarSurfaceHandlers(props: InteractiveFrameToolbarProps) {
  return {
    onWrapperMouseDown: (event: React.MouseEvent) => {
      event.stopPropagation();
    },
    onWrapperClick: (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        props.setIsStepBadgePopoverOpen(false);
        props.setIsCalloutPopoverOpen(false);
      }
    },
    onToolbarMouseDown: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    },
    onToolbarClick: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.target === event.currentTarget) {
        props.setIsStepBadgePopoverOpen(false);
        props.setIsCalloutPopoverOpen(false);
      }
    },
  };
}

export function createInteractiveFrameToolbarActions(props: InteractiveFrameToolbarProps) {
  return {
    ...createSharedToolbarClickHandlers(props),
    handleStepBadgeClick: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      props.setIsCalloutPopoverOpen(false);
      const enabled = props.frame.stepBadge?.enabled ?? false;
      if (!enabled) {
        dispatchStepBadgeEnable(props.frame.id);
        return;
      }
      props.setIsStepBadgePopoverOpen((prev) => !prev);
    },
    handleCalloutClick: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      props.setIsStepBadgePopoverOpen(false);
      const hasCallout = props.frame.callout?.enabled ?? false;
      if (!hasCallout) {
        pagePreparationHistory.beginTransaction(`callout-editing:${props.frame.id}`);
        dispatchCalloutEnable(props.frame.id);
        props.hideTooltip(props.frame.id);
        props.setState('idle');
        props.setIsCalloutPopoverOpen(false);
        props.setIsCalloutEditing(true);
        return;
      }
      props.setIsCalloutPopoverOpen((prev) => !prev);
    },
  };
}
