import type { Canvas } from 'fabric';
import type { EditorRichShapeDocumentObject } from '../../../features/editor/document/rich-shape';
import {
  applyRichShapeDocumentObjectToObject,
  exportRichShapeDocumentObject,
  type RichShapeGroup,
} from '../../objects/rich-shape';
import { applyRichShapeTextEditorRenderState } from './view';

export function applyTextContent(options: {
  object: RichShapeGroup;
  textContent: string;
  withHistoryMuted: <T>(callback: () => T) => T;
}): boolean {
  const shape = exportRichShapeDocumentObject(options.object);
  if (shape.text.content === options.textContent) {
    return false;
  }

  const nextShape: EditorRichShapeDocumentObject = {
    ...shape,
    text: {
      ...shape.text,
      content: options.textContent,
    },
  };
  return options.withHistoryMuted(() =>
    applyRichShapeDocumentObjectToObject(options.object, nextShape)
  );
}

export function applyTextareaRenderState(
  element: HTMLTextAreaElement,
  object: RichShapeGroup,
  canvas: Canvas
): boolean {
  const shape = exportRichShapeDocumentObject(object);
  return applyRichShapeTextEditorRenderState({ canvas, element, object, shape });
}
