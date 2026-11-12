import type { CSSProperties } from 'react';
import { DEFAULT_COLOR_INFO_STRONG } from '@sniptale/ui/default-colors/constants';
import {
  DRAWING_TEXT_LINE_HEIGHT_FACTOR,
  type DrawingTextInkLayout,
} from '../../features/drawing/public';

/** Native input owns interaction; the runtime's existing renderer keeps painting the glyphs. */
export const DRAWING_TEXT_INPUT_PAINT_STYLE: CSSProperties = {
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  textShadow: 'none',
  forcedColorAdjust: 'none',
};

export const DRAWING_TEXT_INPUT_SELECTION_CSS = `
textarea[data-sniptale-drawing-input]::selection {
  background: color-mix(in srgb, ${DEFAULT_COLOR_INFO_STRONG} 22%, transparent);
  color: transparent;
  -webkit-text-fill-color: transparent;
}
`;

/** Shared native-input typography, isolated from inherited host-page text styles. */
export function resolveDrawingTextTypographyStyle(args: {
  fontFamily: string;
  fontSize: number;
  color: string;
}): CSSProperties {
  return {
    boxSizing: 'border-box',
    color: args.color,
    display: 'block',
    fontFamily: args.fontFamily,
    fontSize: `${args.fontSize}px`,
    fontStyle: 'normal',
    fontWeight: 400,
    fontStretch: 'normal',
    fontKerning: 'auto',
    letterSpacing: 'normal',
    wordSpacing: 'normal',
    textIndent: '0px',
    textTransform: 'none',
    textAlign: 'left',
    direction: 'ltr',
    lineHeight: `${args.fontSize * DRAWING_TEXT_LINE_HEIGHT_FACTOR}px`,
    margin: '0px',
    minHeight: '0px',
    minWidth: '0px',
    userSelect: 'text',
    whiteSpace: 'pre-wrap',
    tabSize: 8,
    overflowWrap: 'anywhere',
    position: 'relative',
    width: '100%',
    zIndex: 1,
  };
}

/** Native browser input needs enough padding for glyphs that overhang their advance cells. */
export function resolveDrawingTextInputBox(layout: DrawingTextInkLayout) {
  const left = Math.max(6, layout.inkLeftBearing + 1);
  const right = Math.max(6, layout.inkRightOverhang + 1);
  const top = Math.max(2, layout.inkAscent - layout.fontAscent + 1);
  const bottom = Math.max(2, layout.inkDescent - layout.fontDescent + 1);
  const baseline =
    top + (layout.lineHeight - layout.fontAscent - layout.fontDescent) / 2 + layout.fontAscent;
  return {
    left: layout.originX - left,
    top: layout.firstBaseline - baseline,
    width: layout.logicalWidth - 12 + left + right,
    height: layout.lines.length * layout.lineHeight + top + bottom,
    padding: `${top}px ${right}px ${bottom}px ${left}px`,
  };
}

/** Places native DOM text on the renderer-neutral baseline grid. */
export function resolveDrawingTextLayoutStyle(layout: DrawingTextInkLayout): CSSProperties {
  const box = resolveDrawingTextInputBox(layout);
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    lineHeight: `${layout.lineHeight}px`,
    padding: box.padding,
    position: 'absolute',
  };
}
