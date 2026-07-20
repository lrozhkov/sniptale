import type { VideoAnnotationsRuntimeDeps, VideoAnnotationsState } from './controller.types';
import type { VideoAnnotationPathState } from './runtime';

type AnnotationModifiers = {
  hasAlt: boolean;
  hasCtrl: boolean;
  hasShift: boolean;
};

type VideoAnnotationMouseHandlerDeps = Pick<
  VideoAnnotationsRuntimeDeps,
  'applyAutoFade' | 'createAnnotationElement' | 'scheduleTimeout' | 'updateAnnotationElement'
>;

export function createVideoAnnotationPathState(): VideoAnnotationPathState {
  const pathPoints = new WeakMap<SVGPathElement, Array<{ x: number; y: number }>>();

  return {
    getPoints: (element) => pathPoints.get(element),
    setPoints: (element, points) => {
      pathPoints.set(element, points);
    },
  };
}

function resolveAnnotationModifiers(event: MouseEvent): AnnotationModifiers | null {
  const modifiers = {
    hasAlt: event.altKey,
    hasCtrl: event.ctrlKey,
    hasShift: event.shiftKey,
  };

  if (!modifiers.hasShift && !modifiers.hasAlt && !modifiers.hasCtrl) {
    return null;
  }

  return modifiers;
}

function appendCurrentAnnotationElement(state: VideoAnnotationsState): void {
  if (state.currentElement) {
    state.svgContainer?.appendChild(state.currentElement);
  }
}

function handleAnnotationMouseDown(
  state: VideoAnnotationsState,
  deps: VideoAnnotationMouseHandlerDeps,
  pathState: VideoAnnotationPathState,
  event: MouseEvent
): void {
  if (!state.isEnabled || !state.svgContainer) {
    return;
  }

  const modifiers = resolveAnnotationModifiers(event);
  if (!modifiers) {
    return;
  }

  state.isDrawing = true;
  state.startX = event.clientX;
  state.startY = event.clientY;
  state.currentElement = deps.createAnnotationElement(
    modifiers,
    { x: state.startX, y: state.startY },
    { pathState }
  );
  appendCurrentAnnotationElement(state);
}

function handleAnnotationMouseMove(
  state: VideoAnnotationsState,
  deps: VideoAnnotationMouseHandlerDeps,
  pathState: VideoAnnotationPathState,
  event: MouseEvent
): void {
  if (!state.isDrawing || !state.currentElement || !state.svgContainer) {
    return;
  }

  state.currentElement = deps.updateAnnotationElement(
    state.currentElement,
    state.svgContainer,
    { x: state.startX, y: state.startY },
    { x: event.clientX, y: event.clientY },
    { pathState }
  );
}

function handleAnnotationMouseUp(
  state: VideoAnnotationsState,
  deps: VideoAnnotationMouseHandlerDeps
): void {
  if (!state.isDrawing || !state.currentElement) {
    return;
  }

  state.isDrawing = false;
  deps.applyAutoFade(state.currentElement, state.settings, {
    scheduleTimeout: deps.scheduleTimeout,
  });
  state.currentElement = null;
}

export function createVideoAnnotationMouseHandlers(
  state: VideoAnnotationsState,
  deps: VideoAnnotationMouseHandlerDeps,
  pathState: VideoAnnotationPathState
) {
  return {
    handleMouseDown: (event: MouseEvent): void => {
      handleAnnotationMouseDown(state, deps, pathState, event);
    },
    handleMouseMove: (event: MouseEvent): void => {
      handleAnnotationMouseMove(state, deps, pathState, event);
    },
    handleMouseUp: (): void => {
      handleAnnotationMouseUp(state, deps);
    },
  };
}
