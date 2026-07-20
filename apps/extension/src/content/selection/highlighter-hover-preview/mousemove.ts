import {
  handleFrozenHoverPreview,
  scheduleHoverOverlayUpdate,
  shouldSkipHoverProcessing,
} from './events';
import type { HoverInteractionProps, HoverTrackingState } from './interactions.types';

function buildHoverRuntimeState(props: {
  hoverState: HoverInteractionProps['hoverState'];
  trackingState: HoverTrackingState;
}) {
  return {
    hoverRafId: props.trackingState.hoverRafId,
    hoverState: props.hoverState,
    isHoverPreviewFrozen: props.trackingState.isHoverPreviewFrozen,
    lastHoverProcessTime: props.trackingState.lastHoverProcessTime,
    lastHoverTarget: props.trackingState.lastHoverTarget,
    lastHoverX: props.trackingState.lastHoverX,
    lastHoverY: props.trackingState.lastHoverY,
  };
}

function createHoverRuntimeMutators(props: {
  overlayActions: HoverInteractionProps['overlayActions'];
  trackingState: HoverTrackingState;
}) {
  return {
    hideHoverOverlay: props.overlayActions.hideHoverOverlay,
    setHoverRafId: (value: number | null) => {
      props.trackingState.hoverRafId = value;
    },
    setHoverPreviewFrozen: (value: boolean) => {
      props.trackingState.isHoverPreviewFrozen = value;
    },
    setLastHoverProcessTime: (value: number) => {
      props.trackingState.lastHoverProcessTime = value;
    },
    setLastHoverTarget: (value: HTMLElement | null) => {
      props.trackingState.lastHoverTarget = value;
    },
    setLastHoverX: (value: number) => {
      props.trackingState.lastHoverX = value;
    },
    setLastHoverY: (value: number) => {
      props.trackingState.lastHoverY = value;
    },
    showHoverOverlay: props.overlayActions.showHoverOverlay,
  };
}

function handleFrozenMouseMove(
  trackingState: HoverTrackingState,
  hideHoverOverlay: () => void,
  event: MouseEvent
) {
  return handleFrozenHoverPreview({
    event,
    hideHoverOverlay,
    hoverRuntime: trackingState,
    setHoverPreviewFrozen: (value) => {
      trackingState.isHoverPreviewFrozen = value;
    },
    setLastHoverTarget: (value) => {
      trackingState.lastHoverTarget = value;
    },
    setLastHoverX: (value) => {
      trackingState.lastHoverX = value;
    },
    setLastHoverY: (value) => {
      trackingState.lastHoverY = value;
    },
  });
}

function processMouseMove(
  props: HoverInteractionProps,
  event: MouseEvent,
  iframe?: HTMLIFrameElement
) {
  if (
    shouldSkipHoverProcessing({
      event,
      getState: props.getState,
      hoverRuntime: props.trackingState,
      hoverThrottleMs: props.hoverThrottleMs,
    })
  ) {
    return;
  }

  if (handleFrozenMouseMove(props.trackingState, props.overlayActions.hideHoverOverlay, event)) {
    return;
  }

  scheduleHoverOverlayUpdate({
    event,
    getCallbacks: props.getCallbacks,
    getState: props.getState,
    hoverRuntime: buildHoverRuntimeState(props),
    mutators: createHoverRuntimeMutators(props),
    ...(iframe === undefined ? {} : { iframe }),
  });
}

export function createHoverMouseMoveHandler(props: HoverInteractionProps) {
  return (event: MouseEvent, iframe?: HTMLIFrameElement) => processMouseMove(props, event, iframe);
}
