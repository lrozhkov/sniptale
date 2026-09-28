import { useRef } from 'react';
import {
  getDrawingObjectBounds,
  getDrawingObjectRotation,
  type DrawingObject,
  type DrawingPoint,
} from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import {
  DrawingTextBackgrounds,
  resolveDrawingTextContentStyle,
  resolveDrawingTextDomValue,
  useDrawingTextBackgroundRects,
  type DrawingTextVisualStyle,
} from './text-content';

export function DrawingBlurLayer(props: {
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
          backdropFilter: `blur(${object.kind === 'blur' ? (object.amount ?? 10) : 10}px)`,
          opacity: props.getObjectOpacity?.(object.id) ?? 1,
          transform: `rotate(${getDrawingObjectRotation(object)}deg)`,
          transformOrigin: 'center',
          ...(clipPath ? { clipPath } : {}),
        }}
      />
    );
  });
}

export function DrawingTextLayer(props: {
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
