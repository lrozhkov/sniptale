import {
  useCallback,
  useId,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import {
  DRAWING_TEXT_HORIZONTAL_PADDING,
  DRAWING_TEXT_LINE_HEIGHT_FACTOR,
  DRAWING_TEXT_VERTICAL_PADDING,
  resolveDrawingTextFontFamily,
  resolveDrawingTextBackgroundContours,
  isDrawingTextStencil,
  type DrawingFontFamily,
  type DrawingTextBackgroundRect,
} from '../../features/drawing/public';
import { DrawingTextStencilMask, type DrawingTextStencilSource } from './text-stencil';

export type DrawingTextVisualStyle = {
  backgroundColor: string | null;
  color: string;
  fontFamily: DrawingFontFamily;
  fontSize: number;
};

export function resolveDrawingTextContentStyle(style: DrawingTextVisualStyle): CSSProperties {
  return {
    boxSizing: 'border-box',
    color: style.color,
    display: 'block',
    fontFamily: resolveDrawingTextFontFamily(style.fontFamily),
    fontSize: style.fontSize,
    lineHeight: `${style.fontSize * DRAWING_TEXT_LINE_HEIGHT_FACTOR}px`,
    margin: 0,
    minHeight: style.fontSize * DRAWING_TEXT_LINE_HEIGHT_FACTOR,
    overflowWrap: 'anywhere',
    padding: `${DRAWING_TEXT_VERTICAL_PADDING}px ${DRAWING_TEXT_HORIZONTAL_PADDING / 2}px`,
    position: 'relative',
    whiteSpace: 'pre-wrap',
    width: '100%',
    zIndex: 1,
  };
}

function readDrawingTextBackgroundRects(
  element: HTMLElement,
  value: string,
  lineHeight: number
): DrawingTextBackgroundRect[] {
  if (!value) {
    return [
      {
        height: lineHeight,
        left: 0,
        top: DRAWING_TEXT_VERTICAL_PADDING,
        width: DRAWING_TEXT_HORIZONTAL_PADDING,
      },
    ];
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  if (typeof range.getClientRects !== 'function') {
    return value.split('\n').map((line, index) => ({
      height: lineHeight,
      left: 0,
      top: DRAWING_TEXT_VERTICAL_PADDING + index * lineHeight,
      width: Math.max(DRAWING_TEXT_HORIZONTAL_PADDING, line.length * lineHeight * 0.44),
    }));
  }
  const elementRect = element.getBoundingClientRect();
  const fragments = Array.from(range.getClientRects()).filter((rect) => rect.height > 0);
  return fragments.reduce<DrawingTextBackgroundRect[]>((lines, rect) => {
    const lineIndex = Math.max(
      0,
      Math.round(
        (rect.top - elementRect.top - DRAWING_TEXT_VERTICAL_PADDING) / Math.max(1, lineHeight)
      )
    );
    const top = DRAWING_TEXT_VERTICAL_PADDING + lineIndex * lineHeight;
    const existing = lines.find((line) => Math.abs(line.top - top) < 1);
    const left = rect.left - elementRect.left - DRAWING_TEXT_HORIZONTAL_PADDING / 2;
    const right = rect.right - elementRect.left + DRAWING_TEXT_HORIZONTAL_PADDING / 2;
    if (existing) {
      const previousRight = existing.left + existing.width;
      existing.left = Math.min(existing.left, left);
      existing.width = Math.max(previousRight, right) - existing.left;
      existing.height = lineHeight;
    } else {
      lines.push({ height: lineHeight, left, top, width: right - left });
    }
    return lines;
  }, []);
}

export function resolveDrawingTextDomValue(value: string): string {
  return !value || value.endsWith('\n') ? `${value}\u200b` : value;
}

export function useDrawingTextBackgroundRects(args: {
  contentRef: RefObject<HTMLElement | null>;
  fontFamily: string;
  fontSize: number;
  value: string;
}) {
  const [rects, setRects] = useState<DrawingTextBackgroundRect[]>([]);
  const measure = useCallback(() => {
    const element = args.contentRef.current;
    if (!element) return;
    const parent = element.parentElement;
    const transform = parent?.style.transform ?? '';
    try {
      if (parent) parent.style.transform = 'none';
      setRects(
        readDrawingTextBackgroundRects(
          element,
          args.value,
          args.fontSize * DRAWING_TEXT_LINE_HEIGHT_FACTOR
        )
      );
    } finally {
      if (parent) parent.style.transform = transform;
    }
  }, [args.contentRef, args.fontSize, args.value]);

  useLayoutEffect(() => {
    measure();
    const element = args.contentRef.current;
    const observer =
      element && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (element) observer?.observe(element);
    void document.fonts
      ?.load(`${args.fontSize}px ${args.fontFamily}`, args.value || 'M')
      .then(measure);
    return () => observer?.disconnect();
  }, [args.contentRef, args.fontFamily, args.fontSize, args.value, measure]);

  return rects;
}

export function DrawingTextBackgrounds(props: {
  color: string | null;
  rects: readonly DrawingTextBackgroundRect[];
  text?: DrawingTextStencilSource & { color: string };
}) {
  const maskId = useId();
  const color = props.color;
  if (!color) return null;
  const stencil = props.text && isDrawingTextStencil(props.text.color, color) ? props.text : null;
  const path = resolveDrawingTextBackgroundContours(props.rects)
    .map((corners) => {
      return (
        corners
          .map((corner, index) => {
            const previous = corners[(index + corners.length - 1) % corners.length]!;
            const next = corners[(index + 1) % corners.length]!;
            const incomingDistance = Math.hypot(previous.x - corner.x, previous.y - corner.y);
            const outgoingDistance = Math.hypot(next.x - corner.x, next.y - corner.y);
            const startX = corner.x + ((previous.x - corner.x) * corner.radius) / incomingDistance;
            const startY = corner.y + ((previous.y - corner.y) * corner.radius) / incomingDistance;
            const endX = corner.x + ((next.x - corner.x) * corner.radius) / outgoingDistance;
            const endY = corner.y + ((next.y - corner.y) * corner.radius) / outgoingDistance;
            return [
              `${index === 0 ? 'M' : 'L'} ${startX} ${startY}`,
              `A ${corner.radius} ${corner.radius} 0 0 1 ${endX} ${endY}`,
            ].join(' ');
          })
          .join(' ') + ' Z'
      );
    })
    .join(' ');
  return (
    <svg
      aria-hidden="true"
      data-ui="content.drawing.text-backgrounds"
      style={{
        color,
        height: '100%',
        left: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        position: 'absolute',
        top: 0,
        width: '100%',
        zIndex: 0,
      }}
    >
      {stencil ? (
        <defs>
          <DrawingTextStencilMask id={maskId} source={stencil} rects={props.rects} />
        </defs>
      ) : null}
      <path
        data-ui="content.drawing.text-background"
        d={path}
        fill="currentColor"
        mask={stencil ? `url(#${maskId})` : undefined}
      />
    </svg>
  );
}
