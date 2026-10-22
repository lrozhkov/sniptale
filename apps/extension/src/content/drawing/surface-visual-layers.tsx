import { useLayoutEffect, useRef } from 'react';
import {
  getDrawingObjectBounds,
  getDrawingObjectRotation,
  transformDrawingObjectPoint,
  type DrawingObject,
  type DrawingPoint,
} from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { drawDrawingFrame } from './frame';
import type { DrawingVisualLayer } from './frame-renderables';
import {
  DrawingTextBackgrounds,
  resolveDrawingTextContentStyle,
  resolveDrawingTextDomValue,
  useDrawingTextBackgroundRects,
  type DrawingTextVisualStyle,
} from './text-content';

export function DrawingVisualLayers(props: {
  layers: DrawingVisualLayer[];
  projection: DrawingPoint;
  root: NonNullable<ReturnType<ContentDrawingController['getScrollRoot']>>;
  getObjectOpacity?: (objectId: string) => number;
}) {
  const pixelBudget = 16_777_216 / props.layers.filter((layer) => layer.kind === 'ink').length;
  return props.layers.map((layer, index) => {
    if (layer.kind === 'ink' && index === 0) return null;
    return (
      <div
        key={layer.kind === 'ink' ? layer.objects[0]!.id : layer.object.id}
        data-ui="content.drawing.visual-layer"
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: index }}
      >
        {layer.kind === 'ink' ? (
          <DrawingInkLayer
            objects={layer.objects}
            root={props.root}
            projection={props.projection}
            pixelBudget={pixelBudget}
            {...(props.getObjectOpacity ? { getObjectOpacity: props.getObjectOpacity } : {})}
          />
        ) : layer.kind === 'text' ? (
          <DrawingTextLayer {...props} objects={[layer.object]} />
        ) : (
          <DrawingBlurLayer {...props} objects={[layer.object]} />
        )}
      </div>
    );
  });
}

function DrawingInkLayer(props: {
  objects: DrawingObject[];
  projection: DrawingPoint;
  root: NonNullable<ReturnType<ContentDrawingController['getScrollRoot']>>;
  pixelBudget: number;
  getObjectOpacity?: (objectId: string) => number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    if (!canvasRef.current) return;
    drawDrawingFrame({
      canvas: canvasRef.current,
      objects: props.objects,
      draft: null,
      selectedIds: [],
      root: props.root,
      showChrome: false,
      pixelBudget: props.pixelBudget,
      ...(props.getObjectOpacity ? { getObjectOpacity: props.getObjectOpacity } : {}),
    });
  }, [props.objects, props.root, props.projection, props.pixelBudget, props.getObjectOpacity]);
  return <canvas ref={canvasRef} data-ui="content.drawing.ink-layer" aria-hidden="true" />;
}

export function DrawingBlurLayer(props: {
  getObjectOpacity?: (objectId: string) => number;
  objects: DrawingObject[];
  projection: DrawingPoint;
  root: NonNullable<ReturnType<ContentDrawingController['getScrollRoot']>>;
}) {
  const clip = props.root.kind === 'element' ? props.root.element.getBoundingClientRect() : null;
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  return props.objects.map((object) => {
    const bounds = getDrawingObjectBounds(object);
    const corners = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height },
    ].map((point) => {
      const transformed = transformDrawingObjectPoint(object, point);
      return { x: transformed.x - props.projection.x, y: transformed.y - props.projection.y };
    });
    const left = Math.min(
      viewportWidth,
      Math.max(0, clip?.left ?? 0, Math.min(...corners.map((point) => point.x)))
    );
    const top = Math.min(
      viewportHeight,
      Math.max(0, clip?.top ?? 0, Math.min(...corners.map((point) => point.y)))
    );
    const right = Math.min(
      viewportWidth,
      clip?.right ?? viewportWidth,
      Math.max(...corners.map((point) => point.x))
    );
    const bottom = Math.min(
      viewportHeight,
      clip?.bottom ?? viewportHeight,
      Math.max(...corners.map((point) => point.y))
    );
    return (
      <div
        key={object.id}
        data-sniptale-drawing-object-id={object.id}
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          left,
          top,
          width: Math.max(0, right - left),
          height: Math.max(0, bottom - top),
          backdropFilter: `blur(${object.kind === 'blur' ? (object.amount ?? 10) : 10}px)`,
          opacity: props.getObjectOpacity?.(object.id) ?? 1,
          clipPath: `polygon(${corners.map((point) => `${point.x - left}px ${point.y - top}px`).join(', ')})`,
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
      data-sniptale-drawing-object-id={object.id}
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
      <DrawingTextBackgrounds
        color={style.backgroundColor}
        rects={backgroundRects}
        text={{
          contentRef,
          value: object.text,
          color: style.color,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
        }}
      />
      <span ref={contentRef} style={contentStyle}>
        {resolveDrawingTextDomValue(object.text)}
      </span>
    </div>
  );
}
