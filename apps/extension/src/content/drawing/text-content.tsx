import { useId, useLayoutEffect, useState, type CSSProperties } from 'react';
import {
  resolveDrawingTextFontFamily,
  resolveDrawingTextBackgroundContours,
  isDrawingTextStencil,
  type DrawingFontFamily,
  type DrawingTextBackgroundRect,
  type DrawingTextInkLayout,
} from '../../features/drawing/public';
import {
  resolveDrawingTextTypographyStyle,
  resolveDrawingTextLayoutStyle,
} from '../../ui/drawing-tools/text-style';
import { measureContentDrawingTextLayout } from './text-measurement';
import { DrawingTextStencilMask, type DrawingTextStencilSource } from './text-stencil';

export type DrawingTextVisualStyle = {
  backgroundColor: string | null;
  color: string;
  fontFamily: DrawingFontFamily;
  fontSize: number;
};

export function resolveDrawingTextContentStyle(
  style: DrawingTextVisualStyle,
  layout?: DrawingTextInkLayout
): CSSProperties {
  const typography = resolveDrawingTextTypographyStyle({
    color: style.color,
    fontSize: style.fontSize,
    fontFamily: resolveDrawingTextFontFamily(style.fontFamily),
  });
  return layout ? { ...typography, ...resolveDrawingTextLayoutStyle(layout) } : typography;
}

export function resolveDrawingTextDomValue(value: string): string {
  return !value || value.endsWith('\n') ? `${value}\u200b` : value;
}

export function useDrawingTextLayout(args: {
  fontFamily: string;
  fontSize: number;
  value: string;
  wrapWidth: number;
  autoWidth?: boolean;
  editing?: boolean;
}): DrawingTextInkLayout {
  const [, setFontRevision] = useState(0);
  useLayoutEffect(() => {
    const fonts = document.fonts;
    const font = `${args.fontSize}px ${args.fontFamily}`;
    if (!fonts || typeof fonts.check !== 'function' || fonts.check(font, args.value || 'M')) return;
    let active = true;
    void fonts
      .load(font, args.value || 'M')
      .then(() => {
        if (active) setFontRevision((revision) => revision + 1);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [args.fontFamily, args.fontSize, args.value]);
  return measureContentDrawingTextLayout({
    text: args.value,
    fontSize: args.fontSize,
    wrapWidth: args.wrapWidth,
    ...(args.autoWidth === undefined ? {} : { autoWidth: args.autoWidth }),
    ...(args.editing === undefined ? {} : { editing: args.editing }),
    fontFamilyCss: args.fontFamily,
  });
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
