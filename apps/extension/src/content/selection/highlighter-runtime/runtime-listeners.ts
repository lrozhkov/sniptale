import {
  addEventListenerToAllWindowsDynamic,
  addScrollListenersToAllWindows,
} from '../../platform/frame';
import type { createHighlighterHoverController } from '../highlighter-hover-preview';
import { createHighlighterRuntimeEscapeKeyHandler } from './runtime-escape-key';

type HoverController = ReturnType<typeof createHighlighterHoverController>;

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
