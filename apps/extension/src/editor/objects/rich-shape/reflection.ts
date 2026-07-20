import type { FabricObject } from 'fabric';
import type {
  EditorBuiltInShapeGeometryDefinition,
  EditorRichShapeFill,
  EditorRichShapeDocumentObject,
} from '../../../features/editor/document/rich-shape';

function reflectionSize(shape: EditorRichShapeDocumentObject): number {
  const requested =
    shape.effects.reflection.size <= 1
      ? shape.effects.reflection.size
      : shape.effects.reflection.size / 100;
  return Math.max(0.05, Math.min(1, requested || 0.25));
}

function createReflectionFadeFill(
  fill: EditorRichShapeFill,
  fadeSize: number
): EditorRichShapeFill {
  const color =
    fill.type === 'solid'
      ? fill.color
      : fill.type === 'gradient'
        ? (fill.stops[0]?.color ?? '#ffffff')
        : '#ffffff';
  return {
    type: 'gradient',
    gradientType: 'linear',
    angle: 180,
    stops: [
      { color, offset: 0, transparency: 0 },
      { color, offset: 1 - fadeSize, transparency: 0 },
      { color, offset: 1, transparency: 1 },
    ],
  };
}

export function createRichShapeReflectionObjects(
  shape: EditorRichShapeDocumentObject,
  geometry: EditorBuiltInShapeGeometryDefinition,
  createObjects: (
    reflectedShape: EditorRichShapeDocumentObject,
    geometry: EditorBuiltInShapeGeometryDefinition
  ) => FabricObject[]
): FabricObject[] {
  if (!shape.effects.reflection.enabled || shape.effects.reflection.opacity <= 0) {
    return [];
  }

  const fadeSize = reflectionSize(shape);
  const reflectedShape: EditorRichShapeDocumentObject = {
    ...shape,
    effects: {
      ...shape.effects,
      reflection: { ...shape.effects.reflection, enabled: false },
      shadow: { ...shape.effects.shadow, enabled: false },
    },
    style: {
      ...shape.style,
      fill: createReflectionFadeFill(shape.style.fill, fadeSize),
      line: { ...shape.style.line, transparency: 1 },
    },
    text: { ...shape.text, content: '' },
  };

  return createObjects(reflectedShape, geometry).map((object) => {
    object.set({
      flipY: true,
      opacity: Math.max(0, Math.min(1, shape.effects.reflection.opacity)),
      top: shape.frame.height / 2 + Math.max(0, shape.effects.reflection.distance),
    });
    return object;
  });
}
