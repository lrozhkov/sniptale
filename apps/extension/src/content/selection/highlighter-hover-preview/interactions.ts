import { createLogger } from '@sniptale/platform/observability/logger';
import { createHoverClickHandler } from './click';
import { createHoverMouseMoveHandler } from './mousemove';
import type { HoverInteractionProps } from './interactions.types';

const logger = createLogger({ namespace: 'ContentHighlighter:HoverPreviewInteractions' });

export function createHoverInteractionHandlers(props: HoverInteractionProps) {
  function handleMouseLeave(): void {
    if (!props.getState.isModeEnabled()) return;

    if (props.trackingState.hoverRafId !== null) {
      cancelAnimationFrame(props.trackingState.hoverRafId);
      props.trackingState.hoverRafId = null;
    }

    props.overlayActions.hideHoverOverlay();
    props.trackingState.lastHoverTarget = null;
    logger.debug('Hidden hover preview after leaving the viewport');
  }

  const handleMouseMove = createHoverMouseMoveHandler(props);
  const handleClick = createHoverClickHandler(props);

  return { handleClick, handleMouseLeave, handleMouseMove };
}
