import { appendToContentOverlayRoot } from '../../platform/dom-host';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { createLazyContentDefaultOwner } from '../../application/default-owner';
import {
  applyVideoAnnotationAutoFade,
  createAnnotationElement,
  updateAnnotationElement,
} from './runtime';
import { createDisableVideoAnnotations, createEnableVideoAnnotations } from './controller-actions';
import {
  createVideoAnnotationsState,
  type VideoAnnotationsController,
  type VideoAnnotationsControllerDeps,
  type VideoAnnotationsRuntimeDeps,
} from './controller.types';
import { createVideoAnnotationMouseHandlers, createVideoAnnotationPathState } from './handlers';
import { createVideoAnnotationsOverlay } from './svg';

const logger = createLogger({ namespace: 'ContentVideoAnnotations' });

/**
 * Creates a video-annotations controller that owns overlay DOM, listeners, and drawing state.
 */
export function createVideoAnnotationsController(
  deps: VideoAnnotationsControllerDeps = {}
): VideoAnnotationsController {
  const runtimeDeps: VideoAnnotationsRuntimeDeps = {
    addOverlayNode: deps.addOverlayNode ?? appendToContentOverlayRoot,
    addListener: deps.addListener ?? document.addEventListener.bind(document),
    removeListener: deps.removeListener ?? document.removeEventListener.bind(document),
    applyAutoFade: deps.applyAutoFade ?? applyVideoAnnotationAutoFade,
    createAnnotationElement: deps.createAnnotationElement ?? createAnnotationElement,
    createOverlay: deps.createOverlay ?? createVideoAnnotationsOverlay,
    scheduleTimeout: deps.scheduleTimeout ?? globalThis.setTimeout.bind(globalThis),
    updateAnnotationElement: deps.updateAnnotationElement ?? updateAnnotationElement,
  };
  const state = createVideoAnnotationsState();
  const pathState = createVideoAnnotationPathState();
  const handlers = createVideoAnnotationMouseHandlers(state, runtimeDeps, pathState);

  return {
    enable: createEnableVideoAnnotations(state, runtimeDeps, handlers, logger),
    disable: createDisableVideoAnnotations(state, runtimeDeps, handlers, logger),
    isEnabled: () => state.isEnabled,
  };
}

const videoAnnotationsControllerOwner = createLazyContentDefaultOwner(
  createVideoAnnotationsController
);

/**
 * Enables the legacy singleton-backed video-annotations controller.
 */
export function enableVideoAnnotations(videoSettings?: VideoRecordingSettings): void {
  videoAnnotationsControllerOwner.getOwner().enable(videoSettings);
}

/**
 * Disables the legacy singleton-backed video-annotations controller.
 */
export function disableVideoAnnotations(): void {
  videoAnnotationsControllerOwner.getOwnerIfCreated()?.disable();
}

export type {
  VideoAnnotationsController,
  VideoAnnotationsControllerDeps,
} from './controller.types';
