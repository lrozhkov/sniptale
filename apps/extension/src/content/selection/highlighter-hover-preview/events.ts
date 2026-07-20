import { queryContentUiElement } from '../../platform/dom-host';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { HoverRuntimeState } from './events.helpers';
import { isHighlighterExtensionUiElement } from './helpers';

const logger = createLogger({ namespace: 'ContentHighlighter:HoverPreviewEvents' });

export { scheduleHoverOverlayUpdate } from './events.helpers';

export function shouldSkipHoverProcessing(props: {
  event: MouseEvent;
  getState: {
    isFrameEditing: () => boolean;
    isModeEnabled: () => boolean;
    isPaused: () => boolean;
    isTooltipVisible: () => boolean;
  };
  hoverRuntime: Pick<HoverRuntimeState, 'lastHoverProcessTime' | 'lastHoverX' | 'lastHoverY'>;
  hoverThrottleMs: number;
}) {
  if (
    !props.getState.isModeEnabled() ||
    props.getState.isPaused() ||
    props.getState.isFrameEditing() ||
    props.getState.isTooltipVisible()
  ) {
    return true;
  }

  const dx = Math.abs(props.event.clientX - props.hoverRuntime.lastHoverX);
  const dy = Math.abs(props.event.clientY - props.hoverRuntime.lastHoverY);
  if (dx < 2 && dy < 2) {
    return true;
  }

  return Date.now() - props.hoverRuntime.lastHoverProcessTime < props.hoverThrottleMs;
}

export function handleFrozenHoverPreview(props: {
  event: MouseEvent;
  hideHoverOverlay: () => void;
  hoverRuntime: Pick<HoverRuntimeState, 'isHoverPreviewFrozen'>;
  setHoverPreviewFrozen: (value: boolean) => void;
  setLastHoverTarget: (value: HTMLElement | null) => void;
  setLastHoverX: (value: number) => void;
  setLastHoverY: (value: number) => void;
}) {
  if (!props.hoverRuntime.isHoverPreviewFrozen) {
    return false;
  }

  props.setHoverPreviewFrozen(false);
  props.hideHoverOverlay();
  props.setLastHoverTarget(null);
  props.setLastHoverX(props.event.clientX);
  props.setLastHoverY(props.event.clientY);
  logger.debug('Unfroze hover preview after mouse movement');
  return true;
}

export function shouldIgnoreHighlighterClick(props: {
  eventTarget: HTMLElement;
  getState: {
    isModeEnabled: () => boolean;
    isPaused: () => boolean;
    isTooltipVisible: () => boolean;
  };
}) {
  if (
    !props.getState.isModeEnabled() ||
    props.getState.isPaused() ||
    props.getState.isTooltipVisible()
  ) {
    return true;
  }

  if (
    queryContentUiElement('.sniptale-step-badge-popover') ||
    queryContentUiElement('.sniptale-callout-settings-popover')
  ) {
    return true;
  }

  return isHighlighterExtensionUiElement(props.eventTarget);
}
