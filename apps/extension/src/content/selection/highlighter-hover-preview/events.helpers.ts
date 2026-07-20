import { resolvePagePreparationTarget } from '../../parser/page-preparation/target';
import { isHighlighterExtensionUiElement, isNearExistingFrameBorder } from './helpers';

type HoverFrameCallbacks = {
  addFrame: ((element: HTMLElement) => void) | null;
  hasFrameForElement: ((element: HTMLElement) => boolean) | null;
};

type HoverStateSelectors = {
  isModeEnabled: () => boolean;
  isPaused: () => boolean;
};

export interface HoverRuntimeState {
  hoverRafId: number | null;
  hoverState: Parameters<typeof isNearExistingFrameBorder>[0];
  isHoverPreviewFrozen: boolean;
  lastHoverProcessTime: number;
  lastHoverTarget: HTMLElement | null;
  lastHoverX: number;
  lastHoverY: number;
}

export interface HoverRuntimeMutators {
  hideHoverOverlay: () => void;
  setHoverRafId: (value: number | null) => void;
  setHoverPreviewFrozen: (value: boolean) => void;
  setLastHoverProcessTime: (value: number) => void;
  setLastHoverTarget: (value: HTMLElement | null) => void;
  setLastHoverX: (value: number) => void;
  setLastHoverY: (value: number) => void;
  showHoverOverlay: (element: HTMLElement) => void;
}

export function hideHoverPreview(
  mutators: Pick<HoverRuntimeMutators, 'hideHoverOverlay' | 'setLastHoverTarget'>
): void {
  mutators.hideHoverOverlay();
  mutators.setLastHoverTarget(null);
}

function shouldSuppressHoverTarget(props: {
  hoverState: HoverRuntimeState['hoverState'];
  target: HTMLElement;
  x: number;
  y: number;
}): boolean {
  return (
    isHighlighterExtensionUiElement(props.target) ||
    isNearExistingFrameBorder(props.hoverState, props.x, props.y)
  );
}

function canShowHoverTarget(props: {
  getCallbacks: () => HoverFrameCallbacks;
  hoverRuntime: Pick<HoverRuntimeState, 'lastHoverTarget'>;
  target: HTMLElement;
}): boolean {
  if (props.target === props.hoverRuntime.lastHoverTarget) {
    return false;
  }

  const { hasFrameForElement } = props.getCallbacks();
  return !(hasFrameForElement && hasFrameForElement(props.target));
}

function processScheduledHoverTarget(props: {
  getCallbacks: () => HoverFrameCallbacks;
  getState: HoverStateSelectors;
  hoverRuntime: HoverRuntimeState;
  mutators: HoverRuntimeMutators;
  target: HTMLElement;
  x: number;
  y: number;
}): void {
  if (!props.getState.isModeEnabled() || props.getState.isPaused()) {
    return;
  }

  if (
    shouldSuppressHoverTarget({
      hoverState: props.hoverRuntime.hoverState,
      target: props.target,
      x: props.x,
      y: props.y,
    })
  ) {
    hideHoverPreview(props.mutators);
    return;
  }

  if (
    !canShowHoverTarget({
      getCallbacks: props.getCallbacks,
      hoverRuntime: props.hoverRuntime,
      target: props.target,
    })
  ) {
    if (props.hoverRuntime.lastHoverTarget !== props.target) {
      hideHoverPreview(props.mutators);
    }
    return;
  }

  props.mutators.showHoverOverlay(props.target);
  props.mutators.setLastHoverTarget(props.target);
}

export function scheduleHoverOverlayUpdate(props: {
  event: MouseEvent;
  iframe?: HTMLIFrameElement;
  getCallbacks: () => HoverFrameCallbacks;
  getState: HoverStateSelectors;
  hoverRuntime: HoverRuntimeState;
  mutators: HoverRuntimeMutators;
}): void {
  if (props.hoverRuntime.hoverRafId !== null) {
    return;
  }

  props.mutators.setLastHoverX(props.event.clientX);
  props.mutators.setLastHoverY(props.event.clientY);
  props.mutators.setLastHoverProcessTime(Date.now());

  const target = resolvePagePreparationTarget(props.event, props.iframe);
  if (!target) {
    hideHoverPreview(props.mutators);
    return;
  }

  const hoverRafId = requestAnimationFrame(() => {
    props.mutators.setHoverRafId(null);
    processScheduledHoverTarget({
      getCallbacks: props.getCallbacks,
      getState: props.getState,
      hoverRuntime: props.hoverRuntime,
      mutators: props.mutators,
      target,
      x: props.event.clientX,
      y: props.event.clientY,
    });
  });

  props.mutators.setHoverRafId(hoverRafId);
}
