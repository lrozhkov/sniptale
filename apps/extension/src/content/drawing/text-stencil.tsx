import { useLayoutEffect, useState, type RefObject } from 'react';
import {
  DRAWING_TEXT_HORIZONTAL_PADDING,
  DRAWING_TEXT_LINE_HEIGHT_FACTOR,
  DRAWING_TEXT_VERTICAL_PADDING,
  resolveDrawingTextFontFamily,
  type DrawingFontFamily,
  type DrawingTextBackgroundRect,
} from '../../features/drawing/public';

/** Read-only DOM source for a disposable glyph mask. */
export type DrawingTextStencilSource = {
  contentRef: RefObject<HTMLElement | null>;
  value: string;
  fontFamily: DrawingFontFamily;
  fontSize: number;
};

type StencilLine = { text: string; left: number; baseline: number };

function readFirstBaseline(element: HTMLElement, fallback: number): number {
  const bounds = element.getBoundingClientRect();
  if (!bounds.height) return fallback;
  const probe = document.createElement('span');
  Object.assign(probe.style, {
    display: 'inline-block',
    width: '0px',
    height: '0px',
    padding: '0px',
    fontSize: '0px',
    lineHeight: '0px',
    verticalAlign: 'baseline',
  });
  try {
    element.prepend(probe);
    return probe.getBoundingClientRect().top - bounds.top;
  } finally {
    probe.remove();
  }
}

function readStencilLines(source: DrawingTextStencilSource): StencilLine[] {
  const element = source.contentRef.current;
  if (!element) return [];
  const parent = element.parentElement;
  const transform = parent?.style.transform ?? '';
  try {
    if (parent) parent.style.transform = 'none';
    const lineHeight = source.fontSize * DRAWING_TEXT_LINE_HEIGHT_FACTOR;
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return [];
    context.font = `${source.fontSize}px ${resolveDrawingTextFontFamily(source.fontFamily)}`;
    const metrics = context.measureText('Mg');
    const ascent = metrics.fontBoundingBoxAscent ?? source.fontSize * 0.8;
    const descent = metrics.fontBoundingBoxDescent ?? source.fontSize * 0.2;
    const firstBaseline = readFirstBaseline(
      element,
      DRAWING_TEXT_VERTICAL_PADDING + (lineHeight - ascent - descent) / 2 + ascent
    );
    const range = document.createRange();
    const node = element.firstChild;
    if (!node || typeof range.getClientRects !== 'function') {
      return source.value.split('\n').map((text, index) => ({
        text,
        left: DRAWING_TEXT_HORIZONTAL_PADDING / 2,
        baseline: firstBaseline + index * lineHeight,
      }));
    }
    const bounds = element.getBoundingClientRect();
    const lines = new Map<number, StencilLine>();
    let offset = 0;
    for (const character of source.value) {
      range.setStart(node, offset);
      offset += character.length;
      range.setEnd(node, offset);
      if (character === '\n') continue;
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      const index = Math.max(
        0,
        Math.round((rect.top - bounds.top - DRAWING_TEXT_VERTICAL_PADDING) / lineHeight)
      );
      const previous = lines.get(index);
      if (previous) {
        previous.text += character;
        previous.left = Math.min(previous.left, rect.left - bounds.left);
      } else {
        lines.set(index, {
          text: character,
          left: rect.left - bounds.left,
          baseline: firstBaseline + index * lineHeight,
        });
      }
    }
    return [...lines.values()];
  } finally {
    if (parent) parent.style.transform = transform;
  }
}

export function DrawingTextStencilMask(props: {
  id: string;
  source: DrawingTextStencilSource;
  rects: readonly DrawingTextBackgroundRect[];
}) {
  const { source, rects } = props;
  const { contentRef, value, fontFamily, fontSize } = source;
  const [lines, setLines] = useState<StencilLine[]>([]);
  useLayoutEffect(() => {
    setLines(readStencilLines({ contentRef, value, fontFamily, fontSize }));
  }, [contentRef, value, fontFamily, fontSize, rects]);
  const left = Math.min(0, ...rects.map((rect) => rect.left)) - 1;
  const top = Math.min(0, ...rects.map((rect) => rect.top)) - 1;
  const width = Math.max(0, ...rects.map((rect) => rect.left + rect.width)) - left + 1;
  const height = Math.max(0, ...rects.map((rect) => rect.top + rect.height)) - top + 1;
  return (
    <mask id={props.id} maskUnits="userSpaceOnUse" x={left} y={top} width={width} height={height}>
      <rect x={left} y={top} width={width} height={height} fill="#ffffff" />
      {lines.map((line, index) => (
        <text
          key={index}
          x={line.left}
          y={line.baseline}
          fill="#000000"
          xmlSpace="preserve"
          style={{
            fontFamily: resolveDrawingTextFontFamily(source.fontFamily),
            fontSize: source.fontSize,
            whiteSpace: 'pre',
          }}
        >
          {line.text}
        </text>
      ))}
    </mask>
  );
}
