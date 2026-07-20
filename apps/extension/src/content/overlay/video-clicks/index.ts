import { createLogger } from '@sniptale/platform/observability/logger';
import { createLazyContentDefaultOwner } from '../../application/default-owner';
import { createVideoClicksDomDriver, type VideoClicksDomDriverDeps } from './dom-driver';

const logger = createLogger({ namespace: 'ContentVideoClicks' });

export interface VideoClicksControllerDeps {
  addListener?: typeof document.addEventListener;
  appendOverlayNode?: <T extends Node>(node: T) => T;
  createDomDriver?: (deps: VideoClicksDomDriverDeps) => {
    showRipple: (x: number, y: number) => void;
  };
  removeListener?: typeof document.removeEventListener;
  scheduleTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  targetDocument?: Document;
  targetHead?: HTMLHeadElement;
}

type VideoClicksState = {
  isEnabled: boolean;
};

export interface VideoClicksController {
  disable: () => void;
  enable: () => void;
  isEnabled: () => boolean;
}

function createVideoClicksState(): VideoClicksState {
  return { isEnabled: false };
}

function createVideoClickHandler(
  state: VideoClicksState,
  domDriver: { showRipple: (x: number, y: number) => void }
) {
  return (event: MouseEvent): void => {
    if (!state.isEnabled) {
      return;
    }

    domDriver.showRipple(event.clientX, event.clientY);
  };
}

/**
 * Creates a video-clicks controller with owner-owned listener lifecycle.
 */
export function createVideoClicksController(
  deps: VideoClicksControllerDeps = {}
): VideoClicksController {
  const domDriver = (deps.createDomDriver ?? createVideoClicksDomDriver)({
    ...(deps.appendOverlayNode === undefined ? {} : { appendOverlayNode: deps.appendOverlayNode }),
    ...(deps.scheduleTimeout === undefined ? {} : { scheduleTimeout: deps.scheduleTimeout }),
    ...(deps.targetDocument === undefined ? {} : { targetDocument: deps.targetDocument }),
    ...(deps.targetHead === undefined ? {} : { targetHead: deps.targetHead }),
  });
  const runtimeDeps = {
    addListener: deps.addListener ?? document.addEventListener.bind(document),
    removeListener: deps.removeListener ?? document.removeEventListener.bind(document),
  };
  const state = createVideoClicksState();
  const clickListener = createVideoClickHandler(state, domDriver);

  return {
    enable: () => {
      if (state.isEnabled) {
        return;
      }

      state.isEnabled = true;
      runtimeDeps.addListener('click', clickListener, { capture: true });
      logger.log('Click ripple effects enabled');
    },

    disable: () => {
      if (!state.isEnabled) {
        return;
      }

      state.isEnabled = false;
      runtimeDeps.removeListener('click', clickListener, { capture: true });
      logger.log('Click ripple effects disabled');
    },

    isEnabled: () => state.isEnabled,
  };
}

const videoClicksControllerOwner = createLazyContentDefaultOwner(createVideoClicksController);

/**
 * Enables the legacy singleton-backed video-clicks controller.
 */
export function enableVideoClicks(): void {
  videoClicksControllerOwner.getOwner().enable();
}

/**
 * Disables the legacy singleton-backed video-clicks controller.
 */
export function disableVideoClicks(): void {
  videoClicksControllerOwner.getOwnerIfCreated()?.disable();
}
