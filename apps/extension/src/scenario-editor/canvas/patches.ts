import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import type {
  ScenarioElement,
  ScenarioElementFrame,
  ScenarioLineElement,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { createElementFrameMovePatch } from './drag';
import { createEndpointMovePatch } from './endpoint';
import { createImageContentPanPatch } from './image-content';
import type { ScenarioCanvasMagnetContext, ScenarioCanvasMagnetScope } from './magnet';
import { createElementFrameResizePatch } from './resize';
import type {
  ScenarioCanvasDragSession,
  ScenarioCanvasElementPatch,
  ScenarioCanvasEndpointSession,
  ScenarioCanvasImageContentSession,
  ScenarioCanvasResizeSession,
} from './types';

interface CanvasPointerCoordinates {
  clientX: number;
  clientY: number;
}

type CanvasPointerSession = {
  originClientX: number;
  originClientY: number;
};

export interface InteractionSessionSnapshot {
  dragSession: ScenarioCanvasDragSession | null;
  endpointSession: ScenarioCanvasEndpointSession | null;
  imageContentSession: ScenarioCanvasImageContentSession | null;
  resizeSession: ScenarioCanvasResizeSession | null;
}

export function getActiveInteractionSession(snapshot: InteractionSessionSnapshot) {
  return (
    snapshot.dragSession ??
    snapshot.resizeSession ??
    snapshot.endpointSession ??
    snapshot.imageContentSession
  );
}

function createFramePatch(args: {
  event: CanvasPointerCoordinates;
  magnetScope: ScenarioCanvasMagnetScope | null;
  previewFrame: ScenarioElementFrame | null;
  scale: number;
  snapGridSize: number | null;
  snapshot: InteractionSessionSnapshot;
}): ScenarioElementFrame | null {
  if (args.previewFrame) {
    return args.previewFrame;
  }

  const dragPatch = createDragFramePatch(args);
  return dragPatch ?? createResizeFramePatch(args);
}

export function createInteractionPatch(args: {
  event: CanvasPointerCoordinates;
  magnetScope: ScenarioCanvasMagnetScope | null;
  previewFrame: ScenarioElementFrame | null;
  scale: number;
  snapGridSize: number | null;
  snapshot: InteractionSessionSnapshot;
}): ScenarioCanvasElementPatch | null {
  const frame = createFramePatch(args);
  return frame !== null ? { frame } : (createEndpointPatch(args) ?? createImageContentPatch(args));
}

export function createPreviewFramePatch(args: {
  event: CanvasPointerCoordinates;
  magnetScope: ScenarioCanvasMagnetScope | null;
  scale: number;
  snapGridSize: number | null;
  snapshot: InteractionSessionSnapshot;
}): ScenarioElementFrame | null {
  return createFramePatch({ ...args, previewFrame: null });
}

function createDragFramePatch(args: {
  event: CanvasPointerCoordinates;
  magnetScope: ScenarioCanvasMagnetScope | null;
  scale: number;
  snapGridSize: number | null;
  snapshot: InteractionSessionSnapshot;
}): ScenarioElementFrame | null {
  const session = args.snapshot.dragSession;
  if (!session) {
    return null;
  }

  return createElementFrameMovePatch({
    frame: session.element.frame,
    magnetContext: createSessionMagnetContext(args.magnetScope, session.element.id),
    scale: args.scale,
    snapGridSize: args.snapGridSize,
    ...createPointerSessionPatch(args.event, session),
  });
}

function createResizeFramePatch(args: {
  event: CanvasPointerCoordinates;
  magnetScope: ScenarioCanvasMagnetScope | null;
  scale: number;
  snapGridSize: number | null;
  snapshot: InteractionSessionSnapshot;
}): ScenarioElementFrame | null {
  const session = args.snapshot.resizeSession;
  if (!session) {
    return null;
  }

  return createElementFrameResizePatch({
    frame: session.element.frame,
    handle: session.handle,
    magnetContext: createSessionMagnetContext(args.magnetScope, session.element.id),
    scale: args.scale,
    snapGridSize: args.snapGridSize,
    ...createPointerSessionPatch(args.event, session),
  });
}

function createEndpointPatch(args: {
  event: CanvasPointerCoordinates;
  magnetScope: ScenarioCanvasMagnetScope | null;
  scale: number;
  snapGridSize: number | null;
  snapshot: InteractionSessionSnapshot;
}): ScenarioCanvasElementPatch | null {
  const session = args.snapshot.endpointSession;
  if (!session || !isEndpointEditableElement(session.element)) {
    return null;
  }

  return createEndpointMovePatch({
    end: session.element.end,
    handle: session.handle,
    magnetContext: createSessionMagnetContext(args.magnetScope, session.element.id),
    scale: args.scale,
    snapGridSize: args.snapGridSize,
    start: session.element.start,
    ...createPointerSessionPatch(args.event, session),
  });
}

function createImageContentPatch(args: {
  event: CanvasPointerCoordinates;
  scale: number;
  snapshot: InteractionSessionSnapshot;
}): ScenarioCanvasElementPatch | null {
  const session = args.snapshot.imageContentSession;
  if (!session) {
    return null;
  }

  return createImageContentPanPatch({
    scale: args.scale,
    snapshot: session.contentTransform,
    ...createPointerSessionPatch(args.event, session),
  });
}

function createPointerSessionPatch(event: CanvasPointerCoordinates, session: CanvasPointerSession) {
  return {
    originClientX: session.originClientX,
    originClientY: session.originClientY,
    targetClientX: event.clientX,
    targetClientY: event.clientY,
  };
}

function isEndpointEditableElement(element: ScenarioElement): element is ScenarioLineElement {
  const kind = element.kind;
  return kind === SCENARIO_V3_ELEMENT_KINDS.arrow || kind === SCENARIO_V3_ELEMENT_KINDS.line;
}

function createSessionMagnetContext(
  scope: ScenarioCanvasMagnetScope | null,
  activeElementId: string
): ScenarioCanvasMagnetContext | null {
  return scope ? { ...scope, activeElementId } : null;
}
