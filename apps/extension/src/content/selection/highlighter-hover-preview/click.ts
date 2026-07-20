import { createLogger } from '@sniptale/platform/observability/logger';
import { resolvePagePreparationTarget } from '../../parser/page-preparation/target';
import { shouldIgnoreHighlighterClick } from './events';
import type {
  HighlighterCallbacks,
  HighlighterStateGetters,
  HoverOverlayActions,
  HoverTrackingState,
} from './interactions.types';

const logger = createLogger({ namespace: 'ContentHighlighter:HoverPreviewClick' });

export function createHoverClickHandler(props: {
  getCallbacks: () => HighlighterCallbacks;
  getState: HighlighterStateGetters;
  overlayActions: HoverOverlayActions;
  trackingState: HoverTrackingState;
}) {
  return (event: MouseEvent, iframe?: HTMLIFrameElement) => {
    const target = resolvePagePreparationTarget(event, iframe);
    if (!target) {
      return;
    }

    if (shouldIgnoreHighlighterClick({ eventTarget: target, getState: props.getState })) {
      return;
    }

    const srcStr = iframe?.src
      ? typeof iframe.src === 'string'
        ? iframe.src.substring(0, 30)
        : String(iframe.src).substring(0, 30)
      : '';
    const classStr = typeof target.className === 'string' ? target.className.substring(0, 30) : '';
    logger.debug(
      'Handling hover-preview click',
      iframe ? `(iframe: ${iframe.id || srcStr})` : '(top-level)',
      'target:',
      target.tagName,
      classStr
    );
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const elementForFrame = props.trackingState.lastHoverTarget || target;
    const { addFrame, hasFrameForElement } = props.getCallbacks();

    if (hasFrameForElement && hasFrameForElement(elementForFrame as HTMLElement)) {
      logger.debug('Blocked duplicate frame creation');
      return;
    }

    if (elementForFrame && elementForFrame.nodeType === Node.ELEMENT_NODE && addFrame) {
      addFrame(elementForFrame as HTMLElement);
      props.trackingState.isHoverPreviewFrozen = true;
      props.overlayActions.hideHoverOverlay();
      props.trackingState.lastHoverTarget = null;
      logger.debug('Froze hover preview after creating a frame');
    }
  };
}
