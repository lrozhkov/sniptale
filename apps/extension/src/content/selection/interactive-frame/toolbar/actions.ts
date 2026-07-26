import { translate } from '../../../../platform/i18n';
import type { EffectMode } from '../../../../features/highlighter/contracts';
import { pagePreparationHistory } from '../../../parser/page-preparation/history';
import type { InteractiveFrameToolbarProps } from './types';
import {
  createSharedToolbarClickHandlers,
  dispatchCalloutEnable,
  dispatchStepBadgeEnable,
} from './dispatch';
import type { ToolbarClickEvent } from './dispatch';

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
        props.closePopover();
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
        props.closePopover();
      }
    },
  };
}

export function enableFrameStepBadge(
  props: Pick<InteractiveFrameToolbarProps, 'closePopover'> & {
    frameId: string;
  }
) {
  props.closePopover();
  dispatchStepBadgeEnable(props.frameId);
}

export function startFrameCalloutEditing(
  props: Pick<InteractiveFrameToolbarProps, 'closePopover' | 'setIsCalloutEditing' | 'setState'> & {
    frameId: string;
  }
) {
  props.closePopover();
  pagePreparationHistory.beginTransaction(`callout-editing:${props.frameId}`);
  dispatchCalloutEnable(props.frameId);
  props.setState('idle');
  props.setIsCalloutEditing(true);
}

export function createInteractiveFrameToolbarActions(props: InteractiveFrameToolbarProps) {
  return {
    ...createSharedToolbarClickHandlers(props),
    handleStepBadgeClick: (event: ToolbarClickEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      const enabled = props.frame.stepBadge?.enabled ?? false;
      if (!enabled) {
        enableFrameStepBadge({ closePopover: props.closePopover, frameId: props.frame.id });
        return;
      }
      props.togglePopover(props.frame.id, 'step-badge');
    },
    handleCalloutClick: (event: ToolbarClickEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      const hasCallout = props.frame.callout?.enabled ?? false;
      if (!hasCallout) {
        startFrameCalloutEditing({
          closePopover: props.closePopover,
          frameId: props.frame.id,
          setIsCalloutEditing: props.setIsCalloutEditing,
          setState: props.setState,
        });
        return;
      }
      props.togglePopover(props.frame.id, 'callout-settings');
    },
  };
}
