import type { InteractiveFrameToolbarProps } from './types';
import {
  dispatchFrameCalloutChanged,
  dispatchFrameStepBadgeChanged,
} from '../../../platform/page-context/frame-events';

function stopToolbarEvent(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.nativeEvent.stopImmediatePropagation();
}

export function dispatchStepBadgeEnable(frameId: string) {
  dispatchFrameStepBadgeChanged({ frameId, settings: { enabled: true } });
}

export function dispatchCalloutEnable(frameId: string) {
  dispatchFrameCalloutChanged({ frameId, settings: { enabled: true } });
}

export function createSharedToolbarClickHandlers(props: InteractiveFrameToolbarProps) {
  return {
    handleEffectClick:
      (mode: InteractiveFrameToolbarProps['effectMode']) => (event: React.MouseEvent) => {
        stopToolbarEvent(event);
        props.setIsStepBadgePopoverOpen(false);
        props.setIsCalloutPopoverOpen(false);
        props.handleEffectButtonClick(mode);
      },
    handleEditClick: (event: React.MouseEvent) => {
      stopToolbarEvent(event);
      props.setIsStepBadgePopoverOpen(false);
      props.setIsCalloutPopoverOpen(false);
      props.handleStartEditing();
    },
    handleDeleteClick: (event: React.MouseEvent) => {
      stopToolbarEvent(event);
      props.setIsStepBadgePopoverOpen(false);
      props.setIsCalloutPopoverOpen(false);
      props.handleDelete();
    },
    handleButtonMouseDown: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
