import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
  getDrawingObjectBounds,
  hitTestDrawingDocument,
  type DrawingObject,
  type DrawingPoint,
} from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { useDrawingSessionSnapshot } from './controller';
import { translate } from '../../platform/i18n';
import { drawDrawingFrame } from './frame';
import { handleDrawingKeyDown } from './keyboard';
import {
  getDrawingViewportProjection,
  toDrawingScenePoint,
  type PointerDraft,
} from './interaction';
import { useDrawingPointerRuntime } from './pointer-runtime';
import { DrawingTextEditor, useDrawingTextEditor } from './text-editor';

export { getDrawingViewportProjection, toDrawingScenePoint } from './interaction';

type DrawingPointerRuntime = ReturnType<typeof useDrawingPointerRuntime>;

function stopDrawingHostEvent(event: React.SyntheticEvent<Element>): void {
  event.stopPropagation();
}

function blockDrawingHostEvent(event: React.SyntheticEvent<HTMLCanvasElement>): void {
  event.preventDefault();
  event.stopPropagation();
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

function createDrawingPointerHandlers(pointer: DrawingPointerRuntime) {
  return {
    onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.stopPropagation();
      pointer.onPointerDown(event);
    },
    onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.stopPropagation();
      pointer.onPointerMove(event);
    },
    onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.stopPropagation();
      pointer.finishPointer(event);
    },
    onPointerCancel: (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.stopPropagation();
      pointer.cancelPointer(event);
    },
  };
}

export function DrawingSurface(props: {
  active: boolean;
  chromeHidden: boolean;
  controller: ContentDrawingController;
  onExit?: () => void;
}) {
  const { active, chromeHidden, controller } = props;
  const snapshot = useDrawingSessionSnapshot(controller.session);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewportRevision, setViewportRevision] = useState(0);
  const textEditor = useDrawingTextEditor(controller);
  const {
    cancel: cancelText,
    commit: commitText,
    draft: textDraft,
    edit: editText,
    finalize: finalizeText,
    setDraft: setTextDraft,
  } = textEditor;
  const root = controller.getScrollRoot();
  const pointer = useDrawingPointerRuntime({
    active,
    controller,
    root,
    onCancelText: cancelText,
    onText: setTextDraft,
  });
  const pointerHandlers = createDrawingPointerHandlers(pointer);
  const { cancelDraft, draftRef, draftRevision, finalizeDraft } = pointer;

  useDrawingFrameRedraw({
    active,
    canvasRef,
    chromeHidden,
    controller,
    draftRef,
    draftRevision,
    objects: snapshot.document.objects,
    selectedId: snapshot.selectedObjectId,
    setViewportRevision,
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
        selectedId: null,
        root: controller.getScrollRoot(),
        showChrome: false,
      });
    }
  }, [canvasRef, controller, finalizeDraft, finalizeText]);
  useDrawingInteractionLifecycle({ active, cancelDraft, controller, finalizeInteraction });

  const blurDraft =
    draftRef.current?.kind === 'create' && draftRef.current.object.kind === 'blur'
      ? draftRef.current.object
      : null;
  const blurObjects = [
    ...snapshot.document.objects.filter((object) => object.kind === 'blur'),
    ...(blurDraft ? [blurDraft] : []),
  ];
  const projection = getDrawingViewportProjection(root);
  void viewportRevision;
  return (
    <div
      aria-hidden={!active}
      data-ui="content.drawing.surface"
      style={{ position: 'fixed', inset: 0, pointerEvents: active ? 'auto' : 'none' }}
      {...DRAWING_SURFACE_EVENT_SHIELD}
    >
      <DrawingBlurLayer objects={blurObjects} projection={projection} root={root} />
      <canvas
        ref={canvasRef}
        tabIndex={active ? 0 : -1}
        aria-label={translate('content.toolbar.drawingCanvas')}
        style={{
          position: 'fixed',
          inset: 0,
          touchAction: active ? 'none' : 'auto',
          pointerEvents: active ? 'auto' : 'none',
        }}
        {...pointerHandlers}
        onMouseDown={stopDrawingHostEvent}
        onMouseUp={stopDrawingHostEvent}
        onClick={blockDrawingHostEvent}
        onAuxClick={blockDrawingHostEvent}
        onContextMenu={blockDrawingHostEvent}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const point = toDrawingScenePoint(event, root);
          const object = hitTestDrawingDocument(snapshot.document.objects, point);
          if (object?.kind === 'text') {
            controller.session.select(object.id);
            editText(object);
          }
        }}
        onWheel={(event) => {
          const scrollRoot = controller.getScrollRoot();
          if (scrollRoot.kind === 'element') {
            event.preventDefault();
            scrollRoot.element.scrollBy({
              left: event.deltaX,
              top: event.deltaY,
              behavior: 'instant',
            });
          }
        }}
        onKeyDown={(event) =>
          handleDrawingKeyDown({
            event,
            hasDraft: Boolean(draftRef.current || textDraft),
            onCancelDraft: cancelDraft,
            onEditText: editText,
            ...(props.onExit === undefined ? {} : { onExit: props.onExit }),
            session: controller.session,
            snapshot,
          })
        }
      />
      {active && textDraft ? (
        <DrawingTextEditor
          draft={textDraft}
          projection={projection}
          style={snapshot.defaults.text}
          onCancel={cancelText}
          onChange={setTextDraft}
          onCommit={commitText}
        />
      ) : null}
      {active && snapshot.activeTool === 'select' ? (
        <DrawingObjectList
          objects={snapshot.document.objects}
          onSelect={(id) => controller.session.select(id)}
        />
      ) : null}
    </div>
  );
}

function useDrawingInteractionLifecycle(args: {
  active: boolean;
  cancelDraft: () => void;
  controller: ContentDrawingController;
  finalizeInteraction: () => void;
}) {
  const { active, cancelDraft, controller, finalizeInteraction } = args;
  useEffect(() => {
    controller.registerInteractionFinalizer(finalizeInteraction);
    return () => controller.registerInteractionFinalizer(null);
  }, [controller, finalizeInteraction]);
  useEffect(() => {
    if (!active) cancelDraft();
  }, [active, cancelDraft]);
}

function useDrawingFrameRedraw(args: {
  active: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  chromeHidden: boolean;
  controller: ContentDrawingController;
  draftRef: RefObject<PointerDraft | null>;
  draftRevision: number;
  objects: readonly DrawingObject[];
  selectedId: string | null;
  setViewportRevision: Dispatch<SetStateAction<number>>;
}) {
  const {
    active,
    canvasRef,
    chromeHidden,
    controller,
    draftRef,
    draftRevision,
    objects,
    selectedId,
    setViewportRevision,
  } = args;
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawDrawingFrame({
      canvas,
      objects,
      draft: draftRef.current,
      selectedId,
      root: controller.getScrollRoot(),
      showChrome: active && !chromeHidden,
    });
  }, [active, canvasRef, chromeHidden, controller, draftRef, objects, selectedId]);

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
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [controller, draftRevision, redraw, setViewportRevision]);
}

function DrawingBlurLayer(props: {
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
          ...(clipPath ? { clipPath } : {}),
        }}
      />
    );
  });
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
