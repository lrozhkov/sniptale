import React from 'react';
import type { FabricObject } from 'fabric';
import type { FrameAnnotationSnapshotV1 } from '../../features/highlighter/frame-annotation';
import type { FrameAnnotationCommandId } from '../../features/highlighter/frame-annotation/commands';
import { getFrameAnnotationBlurBackdropStyle } from '../../features/highlighter/frame-annotation/effect-style';
import type { EditorTool } from '../../features/editor/document/types';
import type { EditorLayerItem } from '../../features/editor/document/types';
import type { ResizeDirection } from '../../features/highlighter/contracts';
import {
  preserveFrameAnnotationCalloutDuringResize,
  resizeFrameAnnotationRect,
} from '../../features/highlighter/frame-annotation/interaction/resize-geometry';
import {
  collectFrameAnnotationProxies,
  canMutateFrameAnnotationProxy,
  commitFrameAnnotationProxy,
  createFrameAnnotationProxy,
  synchronizeFrameAnnotationAutoStepBadges,
  synchronizeFrameAnnotationOrdering,
} from './proxy';
import { registerFrameAnnotationDraftFlusher } from './draft-coordinator';
import { applyFrameAnnotationCommand } from './commands';
import type { EditorFrameAnnotationPlaneController } from './types';
import { createFrameAnnotationFromDefaults } from './creation-defaults';
import { useFrameAnnotationKeyboard } from './keyboard';
import { createFrameAnnotationLayerLabel } from './layer-label';

type DragState = {
  mode: 'create' | 'move' | 'resize';
  object: FabricObject | null;
  origin: { x: number; y: number };
  start: FrameAnnotationSnapshotV1;
  resizeDirection?: ResizeDirection;
  calloutCenter?: { x: number; y: number } | null;
};

export const MIN_FRAME_SIZE = 8;

export function useFrameAnnotationInteraction(props: {
  activeTool: EditorTool;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  controller: EditorFrameAnnotationPlaneController;
  layers?: EditorLayerItem[];
}) {
  const [, forceRender] = React.useReducer((value) => value + 1, 0);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<FrameAnnotationSnapshotV1 | null>(null);
  const draftRef = React.useRef<FrameAnnotationSnapshotV1 | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const pendingHistoryRef = React.useRef(false);
  const pendingPreviewObjectRef = React.useRef<FabricObject | null>(null);
  const updateDraft = React.useCallback((value: FrameAnnotationSnapshotV1 | null) => {
    draftRef.current = value;
    setDraft(value);
  }, []);
  const entries = collectFrameAnnotationProxies(props.controller.canvas?.getObjects?.() ?? []);
  const projection = buildProjection(entries, draft, props, selectedId);
  const finishDrag = useFinishDrag({
    controller: props.controller,
    dragRef,
    draftRef,
    entryCount: entries.length,
    forceRender,
    setSelectedId,
    updateDraft,
  });
  const commitPendingHistory = React.useCallback(() => {
    if (!pendingHistoryRef.current) return;
    const object = pendingPreviewObjectRef.current;
    const snapshot = draftRef.current;
    pendingHistoryRef.current = false;
    pendingPreviewObjectRef.current = null;
    if (!object || !snapshot || !canMutateFrameAnnotationProxy(object)) {
      updateDraft(null);
      forceRender();
      return;
    }
    commitFrameAnnotationProxy(object, snapshot);
    synchronizeFrameAnnotationAutoStepBadges(props.controller.canvas?.getObjects?.() ?? []);
    updateDraft(null);
    props.controller.canvas?.requestRenderAll();
    props.controller.commitHistory();
    props.controller.syncRuntimeState();
    forceRender();
  }, [forceRender, props.controller, updateDraft]);

  useFrameAnnotationKeyboard({
    commitPendingDraft: commitPendingHistory,
    controller: props.controller,
    forceRender,
    selectedId,
    setSelectedId,
  });

  React.useEffect(() => {
    const handlePointerMove = (event: PointerEvent) =>
      updateDrag(event, dragRef, updateDraft, props);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [finishDrag, props, updateDraft]);
  React.useEffect(
    () =>
      registerFrameAnnotationDraftFlusher(() => {
        finishDrag();
        commitPendingHistory();
      }),
    [commitPendingHistory, finishDrag]
  );

  const shared = {
    commitPendingHistory,
    dragRef,
    entries,
    forceRender,
    pendingHistoryRef,
    pendingPreviewObjectRef,
    props,
    setSelectedId,
    updateDraft,
  };
  return {
    projection,
    planeEvents: createPlaneEvents(shared),
    objectActions: createObjectActions(shared),
  };
}

function createPlaneEvents(input: {
  commitPendingHistory: () => void;
  dragRef: React.RefObject<DragState | null>;
  entries: ReturnType<typeof collectFrameAnnotationProxies>;
  props: Parameters<typeof useFrameAnnotationInteraction>[0];
  setSelectedId: (id: string | null) => void;
  updateDraft: (draft: FrameAnnotationSnapshotV1 | null) => void;
}) {
  return {
    pointerDown: (event: React.PointerEvent) => {
      if (input.props.activeTool !== 'frame-annotation' || event.button !== 0) return;
      input.commitPendingHistory();
      const point = toLogicalPoint(
        event,
        input.props.canvasRef.current,
        input.props.controller.canvasDocumentSize
      );
      if (!point) return;
      const start = createDefaultSnapshot(point, input.entries.length);
      input.dragRef.current = { mode: 'create', object: null, origin: point, start };
      input.setSelectedId(start.id);
      input.updateDraft(start);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    pointerMove: (event: React.PointerEvent) =>
      updateDrag(event, input.dragRef, input.updateDraft, input.props),
  };
}

function createObjectActions(input: {
  commitPendingHistory: () => void;
  dragRef: React.RefObject<DragState | null>;
  forceRender: () => void;
  pendingHistoryRef: React.RefObject<boolean>;
  pendingPreviewObjectRef: React.RefObject<FabricObject | null>;
  props: Parameters<typeof useFrameAnnotationInteraction>[0];
  setSelectedId: (id: string | null) => void;
  updateDraft: (draft: FrameAnnotationSnapshotV1 | null) => void;
}) {
  return {
    ...createObjectDragActions(input),
    ...createObjectSnapshotActions(input),
    ...createObjectCommandActions(input),
  };
}

type ObjectActionInput = Parameters<typeof createObjectActions>[0];

function createObjectDragActions(input: ObjectActionInput) {
  const { props } = input;
  return {
    startMove: (
      object: FabricObject,
      snapshot: FrameAnnotationSnapshotV1,
      event: React.PointerEvent
    ) => {
      if (props.activeTool !== 'frame-annotation' && props.activeTool !== 'select') return;
      if (!canMutateFrameAnnotationProxy(object)) return;
      input.commitPendingHistory();
      startExistingDrag(
        'move',
        object,
        snapshot,
        event,
        input.dragRef,
        input.updateDraft,
        props,
        input.setSelectedId
      );
    },
    startResize: (
      object: FabricObject,
      snapshot: FrameAnnotationSnapshotV1,
      event: React.PointerEvent,
      direction: ResizeDirection,
      calloutCenter: { x: number; y: number } | null
    ) => {
      if (!canMutateFrameAnnotationProxy(object)) return;
      input.commitPendingHistory();
      startExistingDrag(
        'resize',
        object,
        snapshot,
        event,
        input.dragRef,
        input.updateDraft,
        props,
        input.setSelectedId,
        direction,
        calloutCenter
      );
    },
  };
}

function createObjectSnapshotActions(input: ObjectActionInput) {
  const { props } = input;
  return {
    commitSnapshot: (object: FabricObject, snapshot: FrameAnnotationSnapshotV1) => {
      if (!canMutateFrameAnnotationProxy(object)) return;
      input.pendingHistoryRef.current = false;
      input.pendingPreviewObjectRef.current = null;
      input.updateDraft(null);
      commitFrameAnnotationProxy(object, snapshot);
      synchronizeFrameAnnotationAutoStepBadges(props.controller.canvas?.getObjects?.() ?? []);
      props.controller.canvas?.requestRenderAll();
      props.controller.commitHistory();
      props.controller.syncRuntimeState();
      input.forceRender();
    },
    previewSnapshot: (object: FabricObject, snapshot: FrameAnnotationSnapshotV1) => {
      if (!canMutateFrameAnnotationProxy(object)) return;
      input.pendingHistoryRef.current = true;
      input.pendingPreviewObjectRef.current = object;
      input.updateDraft(snapshot);
      props.controller.canvas?.requestRenderAll();
      input.forceRender();
    },
    commitSnapshotDraft: input.commitPendingHistory,
  };
}

function createObjectCommandActions(input: ObjectActionInput) {
  const { props } = input;
  return {
    reorderStepBadge: (object: FabricObject, direction: 'up' | 'down') => {
      reorderStepBadge({
        controller: props.controller,
        direction,
        forceRender: input.forceRender,
        object,
      });
    },
    runCommand: (
      object: FabricObject,
      snapshot: FrameAnnotationSnapshotV1,
      command: FrameAnnotationCommandId
    ) => {
      runCommand({
        command,
        controller: props.controller,
        forceRender: input.forceRender,
        object,
        setSelectedId: input.setSelectedId,
        snapshot,
      });
    },
  };
}

function reorderStepBadge(input: {
  controller: EditorFrameAnnotationPlaneController;
  direction: 'up' | 'down';
  forceRender: () => void;
  object: FabricObject;
}) {
  const canvas = input.controller.canvas;
  if (!canvas || !canMutateFrameAnnotationProxy(input.object)) return;
  const entries = collectFrameAnnotationProxies(canvas.getObjects?.() ?? []).filter(
    (entry) => entry.snapshot.stepBadge?.enabled && entry.snapshot.stepBadge.auto !== false
  );
  const index = entries.findIndex((entry) => entry.object === input.object);
  const targetIndex = input.direction === 'up' ? index - 1 : index + 1;
  const neighbor = entries[targetIndex];
  const current = entries[index];
  if (!current || !neighbor) return;
  const objects = [...(canvas.getObjects?.() ?? [])];
  const currentObjectIndex = objects.indexOf(current.object);
  const neighborObjectIndex = objects.indexOf(neighbor.object);
  if (currentObjectIndex < 0 || neighborObjectIndex < 0) return;
  [objects[currentObjectIndex], objects[neighborObjectIndex]] = [
    objects[neighborObjectIndex]!,
    objects[currentObjectIndex]!,
  ];
  objects.forEach((candidate, objectIndex) => canvas.moveObjectTo(candidate, objectIndex));
  synchronizeFrameAnnotationOrdering(canvas.getObjects?.() ?? []);
  canvas.requestRenderAll();
  input.controller.commitHistory();
  input.controller.syncRuntimeState();
  input.forceRender();
}

function useFinishDrag(input: {
  controller: EditorFrameAnnotationPlaneController;
  dragRef: React.RefObject<DragState | null>;
  draftRef: React.RefObject<FrameAnnotationSnapshotV1 | null>;
  entryCount: number;
  forceRender: () => void;
  setSelectedId: (id: string | null) => void;
  updateDraft: (draft: FrameAnnotationSnapshotV1 | null) => void;
}) {
  const { controller, dragRef, draftRef, entryCount, forceRender, setSelectedId, updateDraft } =
    input;
  return React.useCallback(() => {
    const drag = dragRef.current;
    const draft = draftRef.current;
    if (!drag || !draft) return;
    controller.clearFrameAnnotationSnap?.();
    dragRef.current = null;
    if (drag.object && !canMutateFrameAnnotationProxy(drag.object)) {
      updateDraft(null);
      forceRender();
      return;
    }
    if (draft.width < MIN_FRAME_SIZE || draft.height < MIN_FRAME_SIZE) {
      updateDraft(null);
      forceRender();
      return;
    }
    const object =
      drag.object ??
      createFrameAnnotationProxy({
        frame: draft,
        ordering: entryCount,
        label: createFrameAnnotationLayerLabel(entryCount + 1),
      });
    if (!drag.object) {
      controller.prepareObject(object);
      object.set({ selectable: false, evented: false, hasBorders: false, hasControls: false });
      controller.canvas?.add(object);
    } else {
      commitFrameAnnotationProxy(object, draft);
    }
    synchronizeFrameAnnotationAutoStepBadges(controller.canvas?.getObjects?.() ?? []);
    controller.canvas?.requestRenderAll();
    controller.commitHistory();
    controller.syncRuntimeState();
    controller.selectLayer?.(draft.id, { focusViewport: false });
    setSelectedId(draft.id);
    updateDraft(null);
    forceRender();
  }, [controller, dragRef, draftRef, entryCount, forceRender, setSelectedId, updateDraft]);
}

function buildProjection(
  entries: ReturnType<typeof collectFrameAnnotationProxies>,
  draft: FrameAnnotationSnapshotV1 | null,
  props: Pick<
    Parameters<typeof useFrameAnnotationInteraction>[0],
    'activeTool' | 'canvasRef' | 'controller' | 'layers'
  >,
  selectedId: string | null
) {
  const projected: Array<{ object: FabricObject | null; snapshot: FrameAnnotationSnapshotV1 }> =
    entries.map((entry) =>
      draft?.id === entry.snapshot.id ? { ...entry, snapshot: draft } : entry
    );
  if (draft && !entries.some((entry) => entry.snapshot.id === draft.id))
    projected.push({ object: null, snapshot: draft });
  const focusFrames = projected
    .map((entry) => entry.snapshot)
    .filter((frame) => frame.effectMode === 'focus');
  const layers = props.layers ?? [];
  const selectedFrameLayers = layers.filter(
    (layer) => layer.selected && layer.type === 'frame-annotation'
  );
  const canonicalSelectedId =
    selectedFrameLayers.length === 1 && layers.filter((layer) => layer.selected).length === 1
      ? selectedFrameLayers[0]!.id
      : null;
  return {
    projected,
    effectiveSelectedId:
      props.activeTool === 'frame-annotation' || props.activeTool === 'select'
        ? (draft?.id ?? canonicalSelectedId ?? selectedId)
        : null,
    scale: getProjectionScale(props.canvasRef.current, props.controller.canvasDocumentSize),
    focusFrames,
    focusOpacity: focusFrames.reduce(
      (maximum, frame) => Math.max(maximum, frame.focusSettings?.opacity ?? 0.5),
      0
    ),
    distortionScale: projected.reduce(
      (maximum, entry) =>
        entry.snapshot.effectMode === 'blur'
          ? Math.max(
              maximum,
              getFrameAnnotationBlurBackdropStyle(entry.snapshot).distortionScale ?? 0
            )
          : maximum,
      0
    ),
  };
}

function createDefaultSnapshot(
  point: { x: number; y: number },
  ordering: number
): FrameAnnotationSnapshotV1 {
  return createFrameAnnotationFromDefaults({
    id: crypto.randomUUID(),
    ordering,
    x: point.x,
    y: point.y,
  });
}

function updateDrag(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  dragRef: React.RefObject<DragState | null>,
  updateDraft: (draft: FrameAnnotationSnapshotV1) => void,
  props: Parameters<typeof useFrameAnnotationInteraction>[0]
) {
  const drag = dragRef.current;
  if (!drag) return;
  const point = toLogicalPoint(event, props.canvasRef.current, props.controller.canvasDocumentSize);
  if (!point) return;
  const dx = point.x - drag.origin.x;
  const dy = point.y - drag.origin.y;
  const next = resolveDraggedFrame({ drag, dx, dy, point, controller: props.controller });
  const snapped =
    drag.mode === 'move'
      ? {
          ...next,
          ...(props.controller.snapFrameAnnotationRect?.({
            excludeId: drag.start.id,
            rect: next,
          }) ?? {}),
        }
      : next;
  updateDraft(snapped);
}

function resolveDraggedFrame(input: {
  controller: EditorFrameAnnotationPlaneController;
  drag: DragState;
  dx: number;
  dy: number;
  point: { x: number; y: number };
}): FrameAnnotationSnapshotV1 {
  const { drag } = input;
  if (drag.mode === 'move') {
    return { ...drag.start, x: drag.start.x + input.dx, y: drag.start.y + input.dy };
  }
  if (drag.mode === 'resize' && drag.resizeDirection) {
    const resized = resizeFrameAnnotationRect({
      deltaX: input.dx,
      deltaY: input.dy,
      direction: drag.resizeDirection,
      minimumSize: MIN_FRAME_SIZE,
      start: drag.start,
    });
    const snapped =
      input.controller.snapFrameAnnotationResizeRect?.({
        direction: drag.resizeDirection,
        excludeId: drag.start.id,
        minimumSize: MIN_FRAME_SIZE,
        rect: resized,
      }) ?? resized;
    return preserveFrameAnnotationCalloutDuringResize(
      drag.start,
      snapped,
      drag.calloutCenter ?? null
    );
  }
  return {
    ...drag.start,
    x: Math.min(drag.origin.x, input.point.x),
    y: Math.min(drag.origin.y, input.point.y),
    width: Math.abs(input.dx),
    height: Math.abs(input.dy),
  };
}

function startExistingDrag(
  mode: 'move' | 'resize',
  object: FabricObject,
  snapshot: FrameAnnotationSnapshotV1,
  event: React.PointerEvent,
  dragRef: React.RefObject<DragState | null>,
  updateDraft: (draft: FrameAnnotationSnapshotV1) => void,
  props: Parameters<typeof useFrameAnnotationInteraction>[0],
  setSelectedId: (id: string) => void,
  resizeDirection?: ResizeDirection,
  calloutCenter?: { x: number; y: number } | null
) {
  const point = toLogicalPoint(event, props.canvasRef.current, props.controller.canvasDocumentSize);
  if (!point) return;
  props.controller.selectLayer?.(snapshot.id, { focusViewport: false });
  setSelectedId(snapshot.id);
  updateDraft(snapshot);
  dragRef.current = {
    mode,
    object,
    origin: point,
    start: snapshot,
    ...(resizeDirection ? { resizeDirection } : {}),
    ...(calloutCenter === undefined ? {} : { calloutCenter }),
  };
  event.stopPropagation();
}

function runCommand(input: {
  command: FrameAnnotationCommandId;
  controller: EditorFrameAnnotationPlaneController;
  forceRender: () => void;
  object: FabricObject;
  setSelectedId: (id: string | null) => void;
  snapshot: FrameAnnotationSnapshotV1;
}) {
  if (input.command === 'close') {
    input.setSelectedId(null);
    input.controller.clearSelection?.();
    input.controller.canvas?.requestRenderAll();
    return;
  }
  if (!canMutateFrameAnnotationProxy(input.object)) return;
  if (input.command === 'delete') {
    input.controller.canvas?.remove(input.object);
    synchronizeFrameAnnotationAutoStepBadges(input.controller.canvas?.getObjects?.() ?? []);
    input.setSelectedId(null);
    input.controller.clearSelection?.();
    input.controller.commitHistory();
    input.controller.syncRuntimeState();
    input.forceRender();
    return;
  }
  const next = applyFrameAnnotationCommand(input.snapshot, input.command);
  if (next === input.snapshot) return;
  commitFrameAnnotationProxy(input.object, next);
  synchronizeFrameAnnotationAutoStepBadges(input.controller.canvas?.getObjects?.() ?? []);
  input.controller.commitHistory();
  input.controller.syncRuntimeState();
  input.forceRender();
}

function getProjectionScale(canvas: HTMLCanvasElement | null, size?: { width: number }): number {
  const rect = canvas?.getBoundingClientRect();
  return rect && size && size.width > 0 ? rect.width / size.width : 1;
}

function toLogicalPoint(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  canvas: HTMLCanvasElement | null,
  size?: { width: number; height: number }
): { x: number; y: number } | null {
  const rect = canvas?.getBoundingClientRect();
  if (!rect || !size || rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((event.clientX - rect.left) / rect.width) * size.width,
    y: ((event.clientY - rect.top) / rect.height) * size.height,
  };
}
