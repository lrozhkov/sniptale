import type { InteractiveFrameToolbarProps } from './types';
import {
  dispatchFrameCalloutChanged,
  dispatchFrameStepBadgeChanged,
} from '../../../platform/page-context/frame-events';
import { MIN_FRAME_SIZE } from '../layout/portal';
import { setFrameHiddenDuringCapture } from '../../../../features/highlighter/frame-annotation/capture-visibility';

const FRAME_SIZE_STEP = 5;

export interface ToolbarClickEvent {
  currentTarget?: EventTarget & Element;
  nativeEvent: { stopImmediatePropagation(): void };
  preventDefault(): void;
  stopPropagation(): void;
}

export function canDecreaseFrameSize(frame: InteractiveFrameToolbarProps['frame']) {
  return (
    frame.width - FRAME_SIZE_STEP * 2 >= MIN_FRAME_SIZE &&
    frame.height - FRAME_SIZE_STEP * 2 >= MIN_FRAME_SIZE
  );
}

export function resizeFrameByStep(
  frame: InteractiveFrameToolbarProps['frame'],
  direction: 'increase' | 'decrease'
) {
  if (direction === 'decrease' && !canDecreaseFrameSize(frame)) return frame;
  const delta = direction === 'increase' ? FRAME_SIZE_STEP : -FRAME_SIZE_STEP;
  return {
    ...frame,
    x: frame.x - delta,
    y: frame.y - delta,
    width: frame.width + delta * 2,
    height: frame.height + delta * 2,
  };
}

function stopToolbarEvent(event: ToolbarClickEvent) {
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

export function createSharedToolbarClickHandlers(
  props: InteractiveFrameToolbarProps,
  captureVisibilityToggle?: () => void
) {
  return {
    handleEffectClick:
      (mode: InteractiveFrameToolbarProps['effectMode']) => (event: ToolbarClickEvent) => {
        stopToolbarEvent(event);
        if (event.currentTarget instanceof HTMLButtonElement) {
          props.popoverAnchorRef.current = event.currentTarget;
        }
        props.handleEffectButtonClick(mode);
      },
    handleEditClick: (event: ToolbarClickEvent) => {
      stopToolbarEvent(event);
      props.closePopover();
      props.handleStartEditing();
    },
    handleDeleteClick: (event: ToolbarClickEvent) => {
      stopToolbarEvent(event);
      props.closePopover();
      props.handleDelete();
    },
    handleCloseClick: (event: ToolbarClickEvent) => {
      stopToolbarEvent(event);
      props.clearSelection();
    },
    handleDecreaseClick: (event: ToolbarClickEvent) => {
      stopToolbarEvent(event);
      const nextFrame = resizeFrameByStep(props.frame, 'decrease');
      if (nextFrame !== props.frame) props.onUpdate(nextFrame);
    },
    handleIncreaseClick: (event: ToolbarClickEvent) => {
      stopToolbarEvent(event);
      props.onUpdate(resizeFrameByStep(props.frame, 'increase'));
    },
    handleCaptureVisibilityClick: (event: ToolbarClickEvent) => {
      stopToolbarEvent(event);
      if (captureVisibilityToggle) {
        captureVisibilityToggle();
        return;
      }
      props.onUpdate(
        setFrameHiddenDuringCapture(
          props.frame,
          !(props.frame.borderSettings?.effects?.capture?.hideFrame ?? false)
        ) as InteractiveFrameToolbarProps['frame']
      );
    },
    handleButtonMouseDown: (event: ToolbarClickEvent) => {
      event.preventDefault();
      event.stopPropagation();
    },
  };
}
