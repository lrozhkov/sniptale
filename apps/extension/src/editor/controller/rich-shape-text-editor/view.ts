import type { Canvas } from 'fabric';
import type { EditorRichShapeDocumentObject } from '../../../features/editor/document/rich-shape';
import { fontFamilyToCss } from '../../document/model';
import { resolveRichShapeTextEditorFrame, resolveRichShapeTextEditorPlacement } from './geometry';
import type { RichShapeGroup } from '../../objects/rich-shape';

function applyTextareaStyle(element: HTMLTextAreaElement, shape: EditorRichShapeDocumentObject) {
  const text = shape.text;
  element.style.boxSizing = 'border-box';
  element.style.position = 'fixed';
  element.style.zIndex = '70';
  element.style.margin = '0';
  element.style.padding = '0';
  element.style.border =
    '1px solid color-mix(in srgb, var(--sniptale-color-accent) 70%, transparent)';
  element.style.outline = 'none';
  element.style.resize = 'none';
  element.style.overflow = text.wrap === 'overflow' ? 'visible' : 'auto';
  element.style.background =
    'color-mix(in srgb, var(--sniptale-color-surface-panel) 14%, transparent)';
  element.style.color = text.color;
  element.style.fontFamily = fontFamilyToCss(text.fontFamily);
  element.style.fontSize = `${Math.max(1, text.fontSize)}px`;
  element.style.fontStyle = text.fontStyle;
  element.style.fontWeight = text.fontWeight;
  element.style.lineHeight = '1.2';
  element.style.textAlign = text.horizontalAlign;
  element.style.textDecoration = [
    text.underline ? 'underline' : '',
    text.strike ? 'line-through' : '',
  ]
    .filter(Boolean)
    .join(' ');
  element.style.transformOrigin = '0 0';
  element.style.whiteSpace = text.wrap === 'wrap' ? 'pre-wrap' : 'pre';
}

function applyTextareaVerticalAlignment(
  element: HTMLTextAreaElement,
  shape: EditorRichShapeDocumentObject
) {
  const frame = resolveRichShapeTextEditorFrame(shape);
  element.style.paddingTop = '0px';
  element.style.paddingBottom = '0px';
  const fallbackTextHeight = Math.max(1, shape.text.fontSize * 1.2);
  const measuredTextHeight = measureTextareaContentHeight(element, frame.width);
  const textHeight = Math.min(frame.height, measuredTextHeight || fallbackTextHeight);
  const remainingHeight = Math.max(0, frame.height - textHeight);
  const offset =
    shape.text.verticalAlign === 'bottom'
      ? remainingHeight
      : shape.text.verticalAlign === 'middle'
        ? remainingHeight / 2
        : 0;
  element.style.paddingTop = `${offset}px`;
}

function measureTextareaContentHeight(element: HTMLTextAreaElement, width: number): number {
  const probe = document.createElement('div');
  probe.textContent = element.value || ' ';
  probe.style.boxSizing = 'border-box';
  probe.style.fontFamily = element.style.fontFamily;
  probe.style.fontSize = element.style.fontSize;
  probe.style.fontStyle = element.style.fontStyle;
  probe.style.fontWeight = element.style.fontWeight;
  probe.style.lineHeight = element.style.lineHeight;
  probe.style.padding = '0';
  probe.style.position = 'fixed';
  probe.style.visibility = 'hidden';
  probe.style.whiteSpace = element.style.whiteSpace;
  probe.style.width = `${Math.max(1, width)}px`;
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

function applyTextareaPlacement(
  element: HTMLTextAreaElement,
  object: RichShapeGroup,
  canvas: Canvas,
  shape: EditorRichShapeDocumentObject
) {
  const frame = resolveRichShapeTextEditorFrame(shape);
  const placement = resolveRichShapeTextEditorPlacement({ canvas, frame, object });
  if (!placement) {
    return false;
  }

  element.style.left = `${placement.left}px`;
  element.style.top = `${placement.top}px`;
  element.style.width = `${placement.width}px`;
  element.style.height = `${placement.height}px`;
  element.style.transform = placement.transform;
  return true;
}

export function applyRichShapeTextEditorRenderState(options: {
  canvas: Canvas;
  element: HTMLTextAreaElement;
  object: RichShapeGroup;
  shape: EditorRichShapeDocumentObject;
}): boolean {
  applyTextareaStyle(options.element, options.shape);
  const placed = applyTextareaPlacement(
    options.element,
    options.object,
    options.canvas,
    options.shape
  );
  applyTextareaVerticalAlignment(options.element, options.shape);
  return placed;
}
