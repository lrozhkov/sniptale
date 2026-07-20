import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoAnnotationsRuntimeDeps, VideoAnnotationsState } from './controller.types';
import type { createVideoAnnotationMouseHandlers } from './handlers';

type VideoAnnotationsHandlers = ReturnType<typeof createVideoAnnotationMouseHandlers>;

function removeVideoAnnotationsOverlay(state: Pick<VideoAnnotationsState, 'svgContainer'>): void {
  if (!state.svgContainer?.parentNode) {
    state.svgContainer = null;
    return;
  }

  state.svgContainer.parentNode.removeChild(state.svgContainer);
  state.svgContainer = null;
}

export function createEnableVideoAnnotations(
  state: VideoAnnotationsState,
  deps: VideoAnnotationsRuntimeDeps,
  handlers: VideoAnnotationsHandlers,
  logger: { log: (message: string, ...args: unknown[]) => void }
) {
  return (videoSettings?: VideoRecordingSettings) => {
    if (state.isEnabled) {
      return;
    }

    state.isEnabled = true;
    state.settings = videoSettings ?? null;
    state.svgContainer = deps.createOverlay();
    deps.addOverlayNode(state.svgContainer);
    deps.addListener('mousedown', handlers.handleMouseDown);
    deps.addListener('mousemove', handlers.handleMouseMove);
    deps.addListener('mouseup', handlers.handleMouseUp);
    logger.log('Annotations enabled with settings', state.settings);
  };
}

export function createDisableVideoAnnotations(
  state: VideoAnnotationsState,
  deps: Pick<VideoAnnotationsRuntimeDeps, 'removeListener'>,
  handlers: VideoAnnotationsHandlers,
  logger: { log: (message: string, ...args: unknown[]) => void }
) {
  return () => {
    if (!state.isEnabled) {
      return;
    }

    state.isEnabled = false;
    state.isDrawing = false;
    state.currentElement = null;
    state.settings = null;
    deps.removeListener('mousedown', handlers.handleMouseDown);
    deps.removeListener('mousemove', handlers.handleMouseMove);
    deps.removeListener('mouseup', handlers.handleMouseUp);
    removeVideoAnnotationsOverlay(state);
    logger.log('Annotations disabled');
  };
}
