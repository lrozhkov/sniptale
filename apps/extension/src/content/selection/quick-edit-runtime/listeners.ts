import {
  addEventListenerToAllWindowsDynamic,
  addScrollListenersToAllWindows,
  getAccessibleIframes,
} from '../../platform/frame';
import type { QuickEditModeEventHandlers } from './controller.contracts';

function registerWindowListeners(
  props: Pick<
    QuickEditModeEventHandlers,
    'handleBlur' | 'handleClick' | 'handleKeyDown' | 'handleMouseMove' | 'handleOutsideClick'
  > & {
    hideHoverOverlay: () => void;
  }
) {
  return {
    cleanupBlur: addEventListenerToAllWindowsDynamic<FocusEvent>('blur', props.handleBlur, {
      capture: true,
    }),
    cleanupClick: addEventListenerToAllWindowsDynamic<MouseEvent>('click', props.handleClick, {
      capture: true,
    }),
    cleanupKeyDown: addEventListenerToAllWindowsDynamic<KeyboardEvent>(
      'keydown',
      props.handleKeyDown,
      { capture: true }
    ),
    cleanupMouseMove: addEventListenerToAllWindowsDynamic<MouseEvent>(
      'mousemove',
      props.handleMouseMove,
      { capture: true }
    ),
    cleanupOutsideClick: addEventListenerToAllWindowsDynamic<MouseEvent>(
      'mousedown',
      props.handleOutsideClick,
      { capture: true }
    ),
    cleanupScroll: addScrollListenersToAllWindows(() => {
      props.hideHoverOverlay();
    }),
  };
}

function createQuickEditListenerCleanup(props: {
  cleanupBlur: () => void;
  cleanupClick: () => void;
  cleanupKeyDown: () => void;
  cleanupMouseMove: () => void;
  cleanupOutsideClick: () => void;
  cleanupScroll: () => void;
  handleMouseLeave: () => void;
}) {
  return () => {
    props.cleanupMouseMove();
    props.cleanupClick();
    props.cleanupKeyDown();
    props.cleanupBlur();
    props.cleanupScroll();
    props.cleanupOutsideClick();
    document.removeEventListener('mouseleave', props.handleMouseLeave);
  };
}

export function registerQuickEditModeListeners(
  props: QuickEditModeEventHandlers & {
    hideHoverOverlay: () => void;
  }
) {
  const cleanupHandles = registerWindowListeners(props);
  document.addEventListener('mouseleave', props.handleMouseLeave);

  return {
    cleanup: createQuickEditListenerCleanup({
      ...cleanupHandles,
      handleMouseLeave: props.handleMouseLeave,
    }),
    iframeCount: getAccessibleIframes().length,
  };
}
