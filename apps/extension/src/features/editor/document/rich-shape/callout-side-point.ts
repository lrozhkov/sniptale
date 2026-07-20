import type { EditorRichShapeCalloutGeometry, EditorRichShapeCalloutSide } from './types';

export function getRichShapeCalloutSidePoint(
  body: EditorRichShapeCalloutGeometry['body'],
  side: EditorRichShapeCalloutSide,
  ratio: number
): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: body.left + body.width * ratio, y: body.top };
    case 'right':
      return { x: body.left + body.width, y: body.top + body.height * ratio };
    case 'bottom':
      return { x: body.left + body.width * ratio, y: body.top + body.height };
    case 'left':
      return { x: body.left, y: body.top + body.height * ratio };
  }
}
