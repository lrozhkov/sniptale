import { createLogger } from '@sniptale/platform/observability/logger';
import {
  addEventListenerToAllWindowsDynamic,
  addScrollListenersToAllWindows,
} from '../../platform/frame';
import {
  dispatchContentModeDisabled,
  dispatchExitFrameEditing,
} from '../../platform/page-context/mode-events';
import type { HoverController } from '../highlighter-hover-preview';

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
  cancelDrawing?: (reason: 'escape') => boolean;
}) {
  return (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || isCalloutEscapeTarget(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (props.cancelDrawing?.('escape')) {
      event.stopImmediatePropagation();
      return;
    }

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
  const { input, overlay } = hoverController;
  const cleanupMouseMove = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'mousemove',
    input.mouseMove,
    { capture: true }
  );
  const cleanupMouseLeave = addEventListenerToAllWindowsDynamic<MouseEvent>(
    'mouseleave',
    () => {
      input.cancelDrawing('mouseleave');
      input.mouseLeave();
    },
    { capture: true }
  );
  const cleanupClick = addEventListenerToAllWindowsDynamic<MouseEvent>('click', input.click, {
    capture: true,
  });
  const cleanupPointerDown = addEventListenerToAllWindowsDynamic<PointerEvent>(
    'pointerdown',
    input.pointerDown,
    { capture: true }
  );
  const cleanupPointerMove = addEventListenerToAllWindowsDynamic<PointerEvent>(
    'pointermove',
    input.pointerMove,
    { capture: true }
  );
  const cleanupPointerUp = addEventListenerToAllWindowsDynamic<PointerEvent>(
    'pointerup',
    input.pointerUp,
    { capture: true }
  );
  const cleanupPointerCancel = addEventListenerToAllWindowsDynamic<PointerEvent>(
    'pointercancel',
    () => input.cancelDrawing('pointercancel'),
    { capture: true }
  );
  const handleWindowBlur = () => input.cancelDrawing('blur');
  window.addEventListener('blur', handleWindowBlur);
  const cleanupScroll = addScrollListenersToAllWindows(() => {
    input.cancelDrawing('scroll');
    overlay.hidePreview();
  });

  return () => {
    cleanupMouseMove();
    cleanupMouseLeave();
    cleanupClick();
    cleanupPointerDown();
    cleanupPointerMove();
    cleanupPointerUp();
    cleanupPointerCancel();
    window.removeEventListener('blur', handleWindowBlur);
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
    createHighlighterRuntimeEscapeKeyHandler({
      ...props,
      cancelDrawing: props.hoverController.input.cancelDrawing,
    }),
    { capture: true }
  );

  return () => {
    cleanupHoverListeners();
    cleanupKeyDown();
  };
}
