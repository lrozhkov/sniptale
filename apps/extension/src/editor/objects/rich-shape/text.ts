import { Textbox, type FabricObject } from 'fabric';
import type { EditorRichShapeDocumentObject } from '../../../features/editor/document/rich-shape';
import { fontFamilyToCss } from '../../document/model';
import { resolveRichShapeTextFrame } from './text-frame/frame';

function resolveTextboxTop(
  shape: EditorRichShapeDocumentObject,
  frameHeight: number,
  textHeight: number
): number {
  switch (shape.text.verticalAlign) {
    case 'bottom':
      return Math.max(0, frameHeight - textHeight);
    case 'middle':
      return Math.max(0, (frameHeight - textHeight) / 2);
    case 'top':
    default:
      return 0;
  }
}

export function createRichShapeTextObject(
  shape: EditorRichShapeDocumentObject
): FabricObject | null {
  const content = shape.text.content.trim();
  if (!content) {
    return null;
  }

  const frame = resolveRichShapeTextFrame(shape);
  const textbox = new Textbox(content, {
    evented: false,
    fill: shape.text.color,
    fontFamily: fontFamilyToCss(shape.text.fontFamily),
    fontSize: Math.max(1, shape.text.fontSize),
    fontStyle: shape.text.fontStyle,
    fontWeight: shape.text.fontWeight,
    height: frame.height,
    left: frame.left,
    objectCaching: false,
    originX: 'left',
    originY: 'top',
    selectable: false,
    splitByGrapheme: false,
    textAlign: shape.text.horizontalAlign,
    top: 0,
    underline: shape.text.underline,
    linethrough: shape.text.strike,
    width: frame.width,
  });

  textbox.set({
    top: frame.top + resolveTextboxTop(shape, frame.height, textbox.height ?? frame.height),
  });
  return textbox;
}
