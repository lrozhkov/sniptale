import type { Group } from 'fabric';
import type { EditorRichShapeDocumentObject } from '../../../features/editor/document/rich-shape';

type ExportableRichShapeGroup = Group & {
  sniptaleId?: string;
  sniptaleLabel?: string;
  sniptaleLocked?: boolean;
  sniptaleRichShape: EditorRichShapeDocumentObject;
};

export function exportRichShapeDocumentObjectFromGroup(
  object: ExportableRichShapeGroup
): EditorRichShapeDocumentObject {
  const shape = structuredClone(object.sniptaleRichShape);
  return {
    ...shape,
    frame: {
      height: Math.max(1, Number(object.height ?? shape.frame.height)),
      left: Number(object.left ?? shape.frame.left),
      top: Number(object.top ?? shape.frame.top),
      width: Math.max(1, Number(object.width ?? shape.frame.width)),
    },
    id: object.sniptaleId ?? shape.id,
    layer: {
      ...shape.layer,
      locked: Boolean(object.sniptaleLocked),
      visible: object.visible !== false,
    },
    rotation: Number(object.angle ?? shape.rotation),
    scaleX: Number(object.scaleX ?? shape.scaleX),
    scaleY: Number(object.scaleY ?? shape.scaleY),
    ...(shape.source
      ? {
          source: {
            ...shape.source,
            name: object.sniptaleLabel ?? shape.source.name,
          },
        }
      : {}),
    style: {
      ...shape.style,
      opacity: Number(object.opacity ?? shape.style.opacity),
    },
  };
}
