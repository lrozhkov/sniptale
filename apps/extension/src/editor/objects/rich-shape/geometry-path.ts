import { Path, type FabricObject } from 'fabric';
import type {
  EditorBuiltInShapeGeometryDefinition,
  EditorBuiltInShapePathCommand,
  EditorRichShapeDocumentObject,
} from '../../../features/editor/document/rich-shape';
import { positionRichShapeChild } from './geometry-layout';
import {
  createRichShapeGradientBackfillOptions,
  createRichShapePrimitiveOptions,
  mapRichShapeX,
  mapRichShapeY,
  shouldRenderRoughGradientBackfill,
} from './render-primitives';
import { tryCreateRoughPath } from './rough-rendering';
import type { RichShapeRenderableStyle } from './style/renderable';

function toPathSegment(
  command: EditorBuiltInShapePathCommand,
  viewBox: EditorBuiltInShapeGeometryDefinition['viewBox'],
  width: number,
  height: number
): string {
  switch (command[0]) {
    case 'M':
    case 'L':
      return `${command[0]} ${mapRichShapeX(command[1], viewBox, width)} ${mapRichShapeY(
        command[2],
        viewBox,
        height
      )}`;
    case 'Q':
      return `Q ${mapRichShapeX(command[1], viewBox, width)} ${mapRichShapeY(
        command[2],
        viewBox,
        height
      )} ${mapRichShapeX(
        command[3],
        viewBox,
        width
      )} ${mapRichShapeY(command[4], viewBox, height)}`;
    case 'C':
      return `C ${mapRichShapeX(command[1], viewBox, width)} ${mapRichShapeY(
        command[2],
        viewBox,
        height
      )} ${mapRichShapeX(
        command[3],
        viewBox,
        width
      )} ${mapRichShapeY(command[4], viewBox, height)} ${mapRichShapeX(
        command[5],
        viewBox,
        width
      )} ${mapRichShapeY(command[6], viewBox, height)}`;
    case 'A':
      return `A ${(command[1] / viewBox.width) * width} ${(command[2] / viewBox.height) * height} ${
        command[3]
      } ${command[4]} ${command[5]} ${mapRichShapeX(command[6], viewBox, width)} ${mapRichShapeY(
        command[7],
        viewBox,
        height
      )}`;
    case 'Z':
      return 'Z';
  }
}

export function createPathObjects(
  geometry: Extract<EditorBuiltInShapeGeometryDefinition, { type: 'path' }>,
  shape: EditorRichShapeDocumentObject,
  width: number,
  height: number,
  style: RichShapeRenderableStyle
): FabricObject[] {
  return geometry.paths.flatMap((primitive, index) => {
    const path = primitive.commands
      .map((command) => toPathSegment(command, geometry.viewBox, width, height))
      .join(' ');
    const roughObjects = tryCreateRoughPath(shape, style, path, index * 101);
    if (roughObjects) {
      const positionedRoughObjects = roughObjects.map((object) =>
        positionRichShapeChild(object, width, height)
      );
      if (!shouldRenderRoughGradientBackfill(shape)) {
        return positionedRoughObjects;
      }

      const options = createRichShapeGradientBackfillOptions(style.fill);
      if (primitive.fillRule) {
        options['fillRule'] = primitive.fillRule;
      }
      return [
        positionRichShapeChild(new Path(path, options), width, height),
        ...positionedRoughObjects,
      ];
    }
    const options = createRichShapePrimitiveOptions(style, style.fill);
    if (primitive.fillRule) {
      options['fillRule'] = primitive.fillRule;
    }
    return positionRichShapeChild(new Path(path, options), width, height);
  });
}
