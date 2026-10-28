import {
  DRAWING_TEXT_HORIZONTAL_PADDING,
  resolveDrawingTextFontFamily,
  type DrawingTextMeasurementPort,
} from '../../features/drawing/public';

export const measureContentDrawingText: DrawingTextMeasurementPort = (args) => {
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return args.line.length * args.fontSize * 0.55;
  context.font = `${args.fontSize}px ${resolveDrawingTextFontFamily(args.fontFamily)}`;
  return context.measureText(args.line).width;
};

/** Fits the rendered lines without changing their browser line breaks. */
export function measureDrawingTextFittedWidth(
  element: HTMLElement,
  committedValue: string
): number | undefined {
  const text = element.firstChild;
  if (!(text instanceof Text)) return undefined;
  const originalValue = text.data;
  const parent = element.parentElement;
  const transform = parent?.style.transform ?? '';
  const width = element.style.width;
  try {
    text.data = committedValue;
    if (parent) parent.style.transform = 'none';
    const originalWidth = parseFloat(getComputedStyle(element).width);
    if (!Number.isFinite(originalWidth) || originalWidth <= 0) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    if (typeof range.getClientRects !== 'function') return;
    const origin = element.getBoundingClientRect();
    const lines = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
    if (!lines.length) return;
    const right = Math.max(...lines.map((rect) => rect.right - origin.left));
    const fittedWidth = Math.min(
      originalWidth,
      Math.ceil(right + DRAWING_TEXT_HORIZONTAL_PADDING / 2)
    );
    element.style.width = `${fittedWidth}px`;
    const fittedLines = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
    const unchanged =
      fittedLines.length === lines.length &&
      lines.every((line, index) => {
        const fitted = fittedLines[index]!;
        return Math.abs(line.width - fitted.width) < 0.01 && Math.abs(line.top - fitted.top) < 0.01;
      });
    return unchanged ? fittedWidth : originalWidth;
  } catch {
    return undefined;
  } finally {
    text.data = originalValue;
    element.style.width = width;
    if (parent) parent.style.transform = transform;
  }
}
