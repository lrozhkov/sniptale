import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  getDrawingObjectBounds,
  getDrawingObjectRotation,
  hitTestDrawingDocument,
  type DrawingObject,
  type DrawingPoint,
  type DrawingResizeHandle,
  type DrawingSessionSnapshot,
  type DrawingTool,
} from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { useDrawingSessionSnapshot } from './controller';
import { translate } from '../../platform/i18n';
import { drawDrawingFrame } from './frame';
import { resolveDrawingFrameRenderables } from './frame-renderables';
import { handleDrawingKeyDown, useDrawingEscapeOwnership } from './keyboard';
import {
  getDrawingViewportProjection,
  resolveDrawingResizeHandle,
  resolveDrawingRotationHandle,
  toDrawingScenePoint,
  type PointerDraft,
} from './interaction';
import { TEXT_DRAG_THRESHOLD, useDrawingPointerRuntime } from './pointer-runtime';
import { DrawingTextEditor, useDrawingTextEditor, type DrawingTextDraft } from './text-editor';
import {
  DrawingTextBackgrounds,
  resolveDrawingTextContentStyle,
  resolveDrawingTextDomValue,
  useDrawingTextBackgroundRects,
  type DrawingTextVisualStyle,
} from './text-content';
import type { PageScrollRoot } from '../platform/page-scroll';
import { toggleContentHostClass } from '../platform/dom-host';
import { isTrustedKeyboardEvent } from '../platform/trusted-events';

export { getDrawingViewportProjection, toDrawingScenePoint } from './interaction';

type DrawingPointerRuntime = ReturnType<typeof useDrawingPointerRuntime>;
type DrawingTextEditorRuntime = ReturnType<typeof useDrawingTextEditor>;
type TextPointerGesture = { dragged: boolean; start: DrawingPoint } | null;

function consumeTextGestureClick(ref: React.MutableRefObject<TextPointerGesture>): boolean {
  const suppress = ref.current?.dragged === true;
  ref.current = null;
  return suppress;
}

const DRAWING_MODE_HOST_CLASS = 'sniptale-drawing-mode-active';
const NO_VISUAL_EFFECTS_SUBSCRIPTION = () => () => undefined;
const ZERO_VISUAL_EFFECTS_REVISION = () => 0;
function resolveDrawingCanvasCursor(active: boolean, tool: DrawingTool): string {
  if (!active || tool === 'select') return 'default';
  return tool === 'text' ? 'text' : 'crosshair';
}

function stopDrawingHostEvent(event: React.SyntheticEvent<Element>): void {
  event.stopPropagation();
}

function blockDrawingHostEvent(event: React.SyntheticEvent<HTMLCanvasElement>): void {
  event.preventDefault();
  event.stopPropagation();
}

function handleDrawingCanvasClick(args: {
  controller: ContentDrawingController;
  editText: DrawingTextEditorRuntime['edit'];
  event: React.MouseEvent<HTMLCanvasElement>;
  hasTextDraft: boolean;
  root: ReturnType<ContentDrawingController['getScrollRoot']>;
  setTextDraft: (draft: DrawingTextDraft) => void;
  suppress: boolean;
}): void {
  blockDrawingHostEvent(args.event);
  if (
    args.suppress ||
    args.hasTextDraft ||
    args.controller.session.getSnapshot().activeTool !== 'text'
  )
    return;
  const point = toDrawingScenePoint(args.event, args.root);
  const object = hitTestDrawingDocument(
    args.controller.session.getSnapshot().document.objects,
    point
  );
  if (object?.kind === 'text') {
    args.controller.session.select(object.id);
    args.editText(object);
    return;
  }
  args.setTextDraft(createAutoWidthTextDraft(point, args.root));
}

function createAutoWidthTextDraft(point: DrawingPoint, root: PageScrollRoot): DrawingTextDraft {
  const projection = getDrawingViewportProjection(root);
  const rightEdge =
    root.kind === 'element' ? root.element.getBoundingClientRect().right : window.innerWidth;
  return {
    autoWidth: true,
    id: null,
    maxWidth: Math.max(80, rightEdge + projection.x - point.x - 8),
    point,
    value: '',
    width: 80,
  };
}

const DRAWING_SURFACE_EVENT_SHIELD = {
  onPointerDown: stopDrawingHostEvent,
  onPointerMove: stopDrawingHostEvent,
  onPointerUp: stopDrawingHostEvent,
  onPointerCancel: stopDrawingHostEvent,
  onMouseDown: stopDrawingHostEvent,
  onMouseUp: stopDrawingHostEvent,
  onClick: stopDrawingHostEvent,
  onAuxClick: stopDrawingHostEvent,
  onContextMenu: stopDrawingHostEvent,
  onDoubleClick: stopDrawingHostEvent,
};

function resolveDrawingCanvasHoverCursor(args: {
  active: boolean;
  point: DrawingPoint;
  pointer: DrawingPointerRuntime;
  snapshot: DrawingSessionSnapshot;
}): string {
  const baseCursor = resolveDrawingCanvasCursor(args.active, args.snapshot.activeTool);
  if (!args.active) return baseCursor;
  const draft = args.pointer.draftRef.current;
  if (draft?.kind === 'rotate') return 'grabbing';
  if (draft?.kind === 'resize')
    return resolveDrawingResizeCursor(draft.handle, true, getDrawingObjectRotation(draft.original));
  const selected =
    args.snapshot.selectedObjectIds.length === 1
      ? args.snapshot.document.objects.find(
          (object) => object.id === args.snapshot.selectedObjectIds[0]
        )
      : null;
  const rotationHandle = selected ? resolveDrawingRotationHandle(selected, args.point) : null;
  if (rotationHandle) return 'grab';
  const handle = selected ? resolveDrawingResizeHandle(selected, args.point) : null;
  if (handle && selected)
    return resolveDrawingResizeCursor(handle, false, getDrawingObjectRotation(selected));
  return baseCursor;
}

function resolveDrawingResizeCursor(
  handle: DrawingResizeHandle,
  dragging: boolean,
  rotation: number
): string {
  if (handle === 'start' || handle === 'end') return dragging ? 'grabbing' : 'grab';
  const direction = {
    n: -90,
    ne: -45,
    e: 0,
    se: 45,
    s: 90,
    sw: 135,
    w: 180,
    nw: -135,
  }[handle];
  const cursors = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;
  const index = ((Math.round((direction + rotation) / 45) % 4) + 4) % 4;
  return cursors[index]!;
}

function createDrawingPointerHandlers(args: {
  active: boolean;
  pointer: DrawingPointerRuntime;
  root: PageScrollRoot;
  snapshot: DrawingSessionSnapshot;
  textGestureRef: React.MutableRefObject<TextPointerGesture>;
  textEditor: DrawingTextEditorRuntime;
}) {
  const { active, pointer, root, snapshot, textEditor, textGestureRef } = args;
  return {
    onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.stopPropagation();
      if (textEditor.draft) {
        textGestureRef.current = {
          dragged: true,
          start: toDrawingScenePoint(event, root),
        };
        textEditor.commit();
        return;
      }
      pointer.onPointerDown(event);
      const draft = pointer.draftRef.current;
      textGestureRef.current =
        (draft?.kind === 'move' || draft?.kind === 'resize') && draft.original.kind === 'text'
          ? { dragged: false, start: toDrawingScenePoint(event, root) }
          : null;
      event.currentTarget.style.cursor = resolveDrawingCanvasHoverCursor({
        active,
        point: toDrawingScenePoint(event, root),
        pointer,
        snapshot,
      });
    },
    onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.stopPropagation();
      const gesture = textGestureRef.current;
      if (gesture && !gesture.dragged) {
        const point = toDrawingScenePoint(event, root);
        gesture.dragged =
          Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >= TEXT_DRAG_THRESHOLD;
      }
      pointer.onPointerMove(event);
      event.currentTarget.style.cursor = resolveDrawingCanvasHoverCursor({
        active,
        point: toDrawingScenePoint(event, root),
        pointer,
        snapshot,
      });
    },
    onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.stopPropagation();
      pointer.finishPointer(event);
      event.currentTarget.style.cursor = resolveDrawingCanvasHoverCursor({
        active,
        point: toDrawingScenePoint(event, root),
        pointer,
        snapshot,
      });
    },
    onPointerCancel: (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.stopPropagation();
      textGestureRef.current = null;
      pointer.cancelPointer(event);
    },
  };
}

function DrawingCanvasLayer(props: {
  active: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  controller: ContentDrawingController;
  onExit?: () => void;
  pointer: DrawingPointerRuntime;
  root: PageScrollRoot;
  snapshot: DrawingSessionSnapshot;
  textEditor: DrawingTextEditorRuntime;
}) {
  const textGestureRef = useRef<TextPointerGesture>(null);
  const pointerHandlers = createDrawingPointerHandlers({
    active: props.active,
    pointer: props.pointer,
    root: props.root,
    snapshot: props.snapshot,
    textGestureRef,
    textEditor: props.textEditor,
  });
  return (
    <canvas
      ref={props.canvasRef}
      className="sniptale-drawing-canvas"
      tabIndex={props.active ? 0 : -1}
      aria-label={translate('content.toolbar.drawingCanvas')}
      style={{
        position: 'fixed',
        inset: 0,
        touchAction: props.active ? 'none' : 'auto',
        pointerEvents: props.active ? 'auto' : 'none',
        cursor: resolveDrawingCanvasCursor(props.active, props.snapshot.activeTool),
      }}
      {...pointerHandlers}
      onMouseDown={stopDrawingHostEvent}
      onMouseUp={stopDrawingHostEvent}
      onClick={(event) =>
        handleDrawingCanvasClick({
          controller: props.controller,
          editText: props.textEditor.edit,
          event,
          hasTextDraft: Boolean(props.textEditor.draft),
          root: props.root,
          setTextDraft: props.textEditor.setDraft,
          suppress: consumeTextGestureClick(textGestureRef),
        })
      }
      onAuxClick={blockDrawingHostEvent}
      onContextMenu={blockDrawingHostEvent}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const point = toDrawingScenePoint(event, props.root);
        const object = hitTestDrawingDocument(props.snapshot.document.objects, point);
        if (object?.kind === 'text') {
          props.controller.session.select(object.id);
          props.textEditor.edit(object);
        }
      }}
      onWheel={(event) => {
        const scrollRoot = props.controller.getScrollRoot();
        if (scrollRoot.kind === 'element' && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          scrollRoot.element.scrollBy({
            left: event.deltaX,
            top: event.deltaY,
            behavior: 'instant',
          });
        }
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (!isTrustedKeyboardEvent(event.nativeEvent)) return;
        handleDrawingKeyDown({
          event,
          hasDraft: Boolean(props.pointer.draftRef.current || props.textEditor.draft),
          onCancelDraft: props.pointer.cancelDraft,
          onEditText: props.textEditor.edit,
          ...(props.onExit === undefined ? {} : { onExit: props.onExit }),
          session: props.controller.session,
          snapshot: props.snapshot,
        });
      }}
    />
  );
}

export function DrawingSurface(props: {
  active: boolean;
  chromeHidden: boolean;
  controller: ContentDrawingController;
  escapeImmediately?: boolean;
  onExit?: () => void;
  showSelectionChrome?: boolean;
  visualEffects?: {
    getOpacity(objectId: string): number;
    getRevision(): number;
    subscribe(listener: () => void): () => void;
  };
}) {
  const { active, chromeHidden, controller } = props;
  const getObjectOpacity = props.visualEffects?.getOpacity;
  const snapshot = useDrawingSessionSnapshot(controller.session);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewportRevision, setViewportRevision] = useState(0);
  const visualRevision = useSyncExternalStore(
    props.visualEffects?.subscribe ?? NO_VISUAL_EFFECTS_SUBSCRIPTION,
    props.visualEffects?.getRevision ?? ZERO_VISUAL_EFFECTS_REVISION,
    ZERO_VISUAL_EFFECTS_REVISION
  );
  const textEditor = useDrawingTextEditor(controller);
  const {
    cancel: cancelText,
    draft: textDraft,
    finalize: finalizeText,
    setDraft: setTextDraft,
  } = textEditor;
  const root = controller.getScrollRoot();
  const pointer = useDrawingPointerRuntime({
    active,
    controller,
    root,
    onCancelText: cancelText,
    onText: (draft) => setTextDraft(createAutoWidthTextDraft(draft.point, root)),
  });
  useDrawingEscapeOwnership({
    active,
    cancelDraft: pointer.cancelDraft,
    cancelText: textEditor.cancel,
    editText: textEditor.edit,
    hasTextDraft: Boolean(textEditor.draft),
    exitImmediately: props.escapeImmediately ?? false,
    ...(props.onExit === undefined ? {} : { onExit: props.onExit }),
    pointerDraftRef: pointer.draftRef,
    session: controller.session,
  });
  const { draftRef, draftRevision, finalizeDraft } = pointer;
  const frameObjects = useMemo(
    () =>
      textDraft?.id
        ? snapshot.document.objects.filter((object) => object.id !== textDraft.id)
        : snapshot.document.objects,
    [snapshot.document.objects, textDraft?.id]
  );
  const editingTextObject = textDraft?.id
    ? snapshot.document.objects.find(
        (object) => object.id === textDraft.id && object.kind === 'text'
      )
    : null;

  useEffect(() => {
    toggleContentHostClass(DRAWING_MODE_HOST_CLASS, active);
    return () => toggleContentHostClass(DRAWING_MODE_HOST_CLASS, false);
  }, [active]);

  useDrawingFrameRedraw({
    active,
    canvasRef,
    chromeHidden,
    controller,
    draftRef,
    draftRevision,
    objects: frameObjects,
    selectedIds: snapshot.selectedObjectIds,
    showSelectionChrome: props.showSelectionChrome ?? true,
    setViewportRevision,
    visualRevision,
    ...(getObjectOpacity ? { getObjectOpacity } : {}),
  });

  const finalizeInteraction = useCallback(() => {
    finalizeDraft();
    finalizeText();
    const canvas = canvasRef.current;
    if (canvas) {
      const finalSnapshot = controller.session.getSnapshot();
      drawDrawingFrame({
        canvas,
        objects: finalSnapshot.document.objects,
        draft: null,
        selectedIds: [],
        root: controller.getScrollRoot(),
        showChrome: false,
        suppressText: true,
        ...(getObjectOpacity ? { getObjectOpacity } : {}),
      });
    }
  }, [canvasRef, controller, finalizeDraft, finalizeText, getObjectOpacity]);
  useDrawingInteractionLifecycle({ active, controller, finalizeInteraction });

  const frameRenderables = resolveDrawingFrameRenderables(frameObjects, draftRef.current);
  const blurObjects = frameRenderables.flatMap(({ object }) =>
    object.kind === 'blur' ? [object] : []
  );
  const projection = getDrawingViewportProjection(root);
  void viewportRevision;
  return (
    <DrawingSurfaceContent
      active={active}
      blurObjects={blurObjects}
      canvasRef={canvasRef}
      controller={controller}
      editingTextObject={editingTextObject}
      frameObjects={frameObjects}
      pointer={pointer}
      projection={projection}
      root={root}
      snapshot={snapshot}
      textDraft={textDraft}
      textEditor={textEditor}
      viewportRevision={viewportRevision}
      {...(props.onExit === undefined ? {} : { onExit: props.onExit })}
      {...(getObjectOpacity ? { getObjectOpacity } : {})}
    />
  );
}

function DrawingSurfaceContent(props: {
  active: boolean;
  blurObjects: DrawingObject[];
  canvasRef: RefObject<HTMLCanvasElement | null>;
  controller: ContentDrawingController;
  editingTextObject: DrawingObject | null | undefined;
  frameObjects: readonly DrawingObject[];
  getObjectOpacity?: (objectId: string) => number;
  onExit?: () => void;
  pointer: DrawingPointerRuntime;
  projection: DrawingPoint;
  root: PageScrollRoot;
  snapshot: DrawingSessionSnapshot;
  textDraft: DrawingTextDraft | null;
  textEditor: DrawingTextEditorRuntime;
  viewportRevision: number;
}) {
  const textObjects = resolveDrawingFrameRenderables(
    props.frameObjects,
    props.pointer.draftRef.current
  ).flatMap(({ object }) => (object.kind === 'text' ? [object] : []));
  return (
    <div
      aria-hidden={!props.active}
      data-ui="content.drawing.surface"
      style={{ position: 'fixed', inset: 0, pointerEvents: props.active ? 'auto' : 'none' }}
      {...DRAWING_SURFACE_EVENT_SHIELD}
    >
      <DrawingBlurLayer
        objects={props.blurObjects}
        projection={props.projection}
        root={props.root}
        {...(props.getObjectOpacity ? { getObjectOpacity: props.getObjectOpacity } : {})}
      />
      <DrawingTextLayer
        objects={textObjects}
        projection={props.projection}
        root={props.root}
        {...(props.getObjectOpacity ? { getObjectOpacity: props.getObjectOpacity } : {})}
      />
      <DrawingCanvasLayer
        active={props.active}
        canvasRef={props.canvasRef}
        controller={props.controller}
        pointer={props.pointer}
        root={props.root}
        snapshot={props.snapshot}
        textEditor={props.textEditor}
        {...(props.onExit === undefined ? {} : { onExit: props.onExit })}
      />
      {props.active && props.textDraft ? (
        <DrawingTextEditor
          draft={props.textDraft}
          layoutRevision={props.viewportRevision}
          projection={props.projection}
          style={
            props.editingTextObject?.kind === 'text'
              ? {
                  backgroundColor: props.editingTextObject.backgroundColor,
                  color: props.editingTextObject.color,
                  fontFamily: props.editingTextObject.fontFamily ?? 'sans',
                  fontSize: props.editingTextObject.fontSize,
                }
              : props.snapshot.defaults.text
          }
          onCancel={props.textEditor.cancel}
          onChange={props.textEditor.setDraft}
          onCommit={props.textEditor.commit}
        />
      ) : null}
      {props.active && props.snapshot.activeTool === 'select' ? (
        <DrawingObjectList
          objects={props.snapshot.document.objects}
          onSelect={(id) => props.controller.session.select(id)}
        />
      ) : null}
    </div>
  );
}

function useDrawingInteractionLifecycle(args: {
  active: boolean;
  controller: ContentDrawingController;
  finalizeInteraction: () => void;
}) {
  const { active, controller, finalizeInteraction } = args;
  useEffect(() => {
    controller.registerInteractionFinalizer(finalizeInteraction);
    return () => controller.registerInteractionFinalizer(null);
  }, [controller, finalizeInteraction]);
  useEffect(() => {
    if (!active) finalizeInteraction();
  }, [active, finalizeInteraction]);
}

function useDrawingFrameRedraw(args: {
  active: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  chromeHidden: boolean;
  controller: ContentDrawingController;
  draftRef: RefObject<PointerDraft | null>;
  draftRevision: number;
  objects: readonly DrawingObject[];
  selectedIds: readonly string[];
  showSelectionChrome: boolean;
  setViewportRevision: Dispatch<SetStateAction<number>>;
  visualRevision: number;
  getObjectOpacity?: (objectId: string) => number;
}) {
  const {
    active,
    canvasRef,
    chromeHidden,
    controller,
    draftRef,
    draftRevision,
    objects,
    selectedIds,
    showSelectionChrome,
    setViewportRevision,
  } = args;
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawDrawingFrame({
      canvas,
      objects,
      draft: draftRef.current,
      selectedIds,
      root: controller.getScrollRoot(),
      showChrome: active && !chromeHidden && showSelectionChrome,
      suppressText: true,
      ...(args.getObjectOpacity ? { getObjectOpacity: args.getObjectOpacity } : {}),
    });
  }, [
    active,
    canvasRef,
    chromeHidden,
    controller,
    draftRef,
    objects,
    selectedIds,
    showSelectionChrome,
    args.getObjectOpacity,
  ]);

  useEffect(() => {
    let frame = requestAnimationFrame(redraw);
    const scrollRoot = controller.getScrollRoot();
    const target: EventTarget = scrollRoot.kind === 'element' ? scrollRoot.element : window;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(redraw);
      setViewportRevision((value) => value + 1);
    };
    target.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
    };
  }, [controller, draftRevision, redraw, setViewportRevision, args.visualRevision]);
}

function DrawingBlurLayer(props: {
  getObjectOpacity?: (objectId: string) => number;
  objects: DrawingObject[];
  projection: DrawingPoint;
  root: NonNullable<ReturnType<ContentDrawingController['getScrollRoot']>>;
}) {
  const clip = props.root.kind === 'element' ? props.root.element.getBoundingClientRect() : null;
  return props.objects.map((object) => {
    const bounds = getDrawingObjectBounds(object);
    const left = bounds.x - props.projection.x;
    const top = bounds.y - props.projection.y;
    const clipTop = clip ? Math.max(0, clip.top - top) : 0;
    const clipRight = clip ? Math.max(0, left + bounds.width - clip.right) : 0;
    const clipBottom = clip ? Math.max(0, top + bounds.height - clip.bottom) : 0;
    const clipLeft = clip ? Math.max(0, clip.left - left) : 0;
    const clipPath = clip
      ? `inset(${clipTop}px ${clipRight}px ${clipBottom}px ${clipLeft}px)`
      : undefined;
    return (
      <div
        key={object.id}
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          left,
          top,
          width: bounds.width,
          height: bounds.height,
          backdropFilter: 'blur(10px)',
          opacity: props.getObjectOpacity?.(object.id) ?? 1,
          transform: `rotate(${getDrawingObjectRotation(object)}deg)`,
          transformOrigin: 'center',
          ...(clipPath ? { clipPath } : {}),
        }}
      />
    );
  });
}

function DrawingTextLayer(props: {
  getObjectOpacity?: (objectId: string) => number;
  objects: Extract<DrawingObject, { kind: 'text' }>[];
  projection: DrawingPoint;
  root: NonNullable<ReturnType<ContentDrawingController['getScrollRoot']>>;
}) {
  const clip = props.root.kind === 'element' ? props.root.element.getBoundingClientRect() : null;
  return props.objects.map((object, index) => (
    <DrawingTextObject
      key={`${object.id}:${index}`}
      clip={clip}
      object={object}
      projection={props.projection}
      opacity={props.getObjectOpacity?.(object.id) ?? 1}
    />
  ));
}

function DrawingTextObject(props: {
  clip: DOMRect | null;
  object: Extract<DrawingObject, { kind: 'text' }>;
  projection: DrawingPoint;
  opacity: number;
}) {
  const contentRef = useRef<HTMLSpanElement>(null);
  const { object } = props;
  const style: DrawingTextVisualStyle = {
    backgroundColor: object.backgroundColor,
    color: object.color,
    fontFamily: object.fontFamily ?? 'sans',
    fontSize: object.fontSize,
  };
  const contentStyle = resolveDrawingTextContentStyle(style);
  const backgroundRects = useDrawingTextBackgroundRects({
    contentRef,
    fontFamily:
      typeof contentStyle.fontFamily === 'string' ? contentStyle.fontFamily : 'sans-serif',
    fontSize: style.fontSize,
    value: object.text,
  });
  const bounds = getDrawingObjectBounds(object);
  const left = bounds.x - props.projection.x;
  const top = bounds.y - props.projection.y;
  const clipTop = props.clip ? Math.max(0, props.clip.top - top) : 0;
  const clipRight = props.clip ? Math.max(0, left + bounds.width - props.clip.right) : 0;
  const clipBottom = props.clip ? Math.max(0, top + bounds.height - props.clip.bottom) : 0;
  const clipLeft = props.clip ? Math.max(0, props.clip.left - left) : 0;
  return (
    <div
      data-ui="content.drawing.text-object"
      style={{
        ...(props.clip
          ? { clipPath: `inset(${clipTop}px ${clipRight}px ${clipBottom}px ${clipLeft}px)` }
          : {}),
        height: bounds.height,
        left,
        overflow: 'visible',
        pointerEvents: 'none',
        opacity: props.opacity,
        position: 'fixed',
        top,
        transform: `rotate(${getDrawingObjectRotation(object)}deg)`,
        transformOrigin: 'center',
        width: bounds.width,
      }}
    >
      <DrawingTextBackgrounds color={style.backgroundColor} rects={backgroundRects} />
      <span ref={contentRef} style={contentStyle}>
        {resolveDrawingTextDomValue(object.text)}
      </span>
    </div>
  );
}

function DrawingObjectList(props: {
  objects: readonly DrawingObject[];
  onSelect: (id: string) => void;
}) {
  return (
    <div
      aria-label={translate('content.toolbar.drawingObjects')}
      style={{ position: 'fixed', left: -10000, top: 0, width: 1, height: 1, overflow: 'hidden' }}
    >
      {props.objects.map((object, index) => (
        <button
          key={object.id}
          type="button"
          aria-label={`${translate('content.toolbar.drawingObject')} ${index + 1}`}
          onFocus={() => props.onSelect(object.id)}
          onClick={() => props.onSelect(object.id)}
        />
      ))}
    </div>
  );
}
