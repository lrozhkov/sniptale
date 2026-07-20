import { enableQuickEditCursor } from './helpers';
import type {
  QuickEditModeEventHandlers,
  QuickEditModeListenerRegistrationProps,
} from './controller.contracts';
import { registerQuickEditModeListeners } from './listeners';

function enableQuickEditMode(props: QuickEditModeListenerRegistrationProps) {
  props.createHoverOverlay();
  props.createBlockingOverlay();

  const listenerRegistration = registerQuickEditModeListeners({
    handleBlur: props.handleBlur,
    handleClick: props.handleClick,
    handleKeyDown: props.handleKeyDown,
    handleMouseLeave: props.handleMouseLeave,
    handleMouseMove: props.handleMouseMove,
    handleOutsideClick: props.handleOutsideClick,
    hideHoverOverlay: props.hideHoverOverlay,
  });
  props.setCleanupEventListeners(listenerRegistration.cleanup);
  enableQuickEditCursor(props.overlayState);
  return listenerRegistration.iframeCount;
}

export function createQuickEditModeListenerRegistration(
  props: QuickEditModeListenerRegistrationProps
) {
  return () => enableQuickEditMode(props);
}

export function createQuickEditModeListenerProps(
  props: QuickEditModeEventHandlers & {
    overlayActions: Pick<
      QuickEditModeListenerRegistrationProps,
      'createBlockingOverlay' | 'createHoverOverlay' | 'hideHoverOverlay'
    >;
    overlayState: Parameters<typeof enableQuickEditCursor>[0];
    setCleanupEventListeners: QuickEditModeListenerRegistrationProps['setCleanupEventListeners'];
  }
): QuickEditModeListenerRegistrationProps {
  return {
    createBlockingOverlay: props.overlayActions.createBlockingOverlay,
    createHoverOverlay: props.overlayActions.createHoverOverlay,
    handleBlur: props.handleBlur,
    handleClick: props.handleClick,
    handleKeyDown: props.handleKeyDown,
    handleMouseLeave: props.handleMouseLeave,
    handleMouseMove: props.handleMouseMove,
    handleOutsideClick: props.handleOutsideClick,
    hideHoverOverlay: props.overlayActions.hideHoverOverlay,
    overlayState: props.overlayState,
    setCleanupEventListeners: props.setCleanupEventListeners,
  };
}
