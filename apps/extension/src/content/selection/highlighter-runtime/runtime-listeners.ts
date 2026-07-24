import { createLogger } from '@sniptale/platform/observability/logger';
import {
  addEventListenerToAllWindowsDynamic,
  addScrollListenersToAllWindows,
} from '../../platform/frame';
import {
  dispatchContentModeDisabled,
  dispatchExitFrameEditing,
} from '../../platform/page-context/mode-events';
import type { createHighlighterHoverController } from '../highlighter-hover-preview';

type HoverController = ReturnType<typeof createHighlighterHoverController>;
const logger = createLogger({ namespace: 'ContentHighlighter:Runtime' });

function isCalloutEscapeTarget(event: KeyboardEvent): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (active?.closest?.('.sniptale-callout')) {
    return true;
  }

  const eventPath =
    typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  return eventPath.some((target) => {
    return target instanceof Element && Boolean(target.closest('.sniptale-callout'));
  });
}

export function createHighlighterRuntimeEscapeKeyHandler(props: {
  disableHighlighterMode: () => void;
  isAnyFrameEditing: () => boolean;
}) {
  return (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || isCalloutEscapeTarget(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (props.isAnyFrameEditing()) {
      dispatchExitFrameEditing();
      logger.debug('Escaped from frame editing mode');
      return;
    }

    props.disableHighlighterMode();
    dispatchContentModeDisabled({ mode: 'highlighter' });
  };
}

function registerHoverListeners(hoverController: HoverController) {
  const cleanupMouseMove = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'mousemove',
    hoverController.handleMouseMove,
    { capture: true }
  );
  const cleanupMouseLeave = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'mouseleave',
    () => hoverController.handleMouseLeave(),
    { capture: true }
  );
  const cleanupClick = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'click',
    hoverController.handleClick,
    { capture: true }
  );
  const cleanupScroll = addScrollListenersToAllWindows(() => {
    hoverController.hideHoverOverlay();
  });

  return () => {
    cleanupMouseMove();
    cleanupMouseLeave();
    cleanupClick();
    cleanupScroll();
  };
}

export function registerHighlighterRuntimeListeners(props: {
  disableHighlighterMode: () => void;
  hoverController: HoverController;
  isAnyFrameEditing: () => boolean;
}) {
  const cleanupHoverListeners = registerHoverListeners(props.hoverController);
  const cleanupKeyDown = addEventListenerToAllWindowsDynamic<KeyboardEvent>(
    'keydown',
    createHighlighterRuntimeEscapeKeyHandler(props),
    { capture: true }
  );

  return () => {
    cleanupHoverListeners();
    cleanupKeyDown();
  };
}
