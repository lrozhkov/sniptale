import type { Canvas, SerializedObjectProps } from 'fabric';
import { emptyCanvasJson } from '../core/helpers';
import { CUSTOM_JSON_PROPS, isSourceObject, isUserObject } from '../../document/model';
import { isRichShapeObject } from '../../objects/rich-shape/guards';

const EDITOR_DOCUMENT_JSON_PROPS = [
  ...CUSTOM_JSON_PROPS,
  'sniptaleBlurStrokeColor',
  'sniptaleBlurStrokeWidth',
] as const;

export function serializeCanvasObjects(canvas: Canvas | null): string {
  if (!canvas) {
    return emptyCanvasJson();
  }
  const objects = canvas
    .getObjects()
    .filter((object) => isUserObject(object) && !isRichShapeObject(object))
    .map((object): SerializedObjectProps => {
      const serialized = object.toObject([
        ...EDITOR_DOCUMENT_JSON_PROPS,
      ]) as SerializedObjectProps & {
        clipPath?: unknown;
      };

      if (isSourceObject(object)) {
        delete serialized.clipPath;
      }

      return serialized;
    });
  return JSON.stringify({ version: '7.2.0', objects });
}
