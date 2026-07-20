import type {
  EditorBuiltInShapeGeometryDefinition,
  EditorBuiltInShapePathCommand,
  EditorBuiltInShapePathGeometry,
  EditorBuiltInShapePathPrimitive,
  EditorBuiltInShapePolylineGeometry,
  EditorBuiltInShapeViewBox,
} from '../../../../features/editor/document/rich-shape';
import { measureExcalidrawPoints } from './points';
import type { ExcalidrawElementModel, ExcalidrawMappedElement } from './types';

function viewBox(width: number, height: number): EditorBuiltInShapeViewBox {
  return { minX: 0, minY: 0, width: Math.max(1, width), height: Math.max(1, height) };
}

function path(
  width: number,
  height: number,
  commands: readonly EditorBuiltInShapePathCommand[]
): EditorBuiltInShapePathGeometry {
  return { type: 'path', viewBox: viewBox(width, height), paths: [{ commands }] };
}

function rectangle(width: number, height: number): EditorBuiltInShapePathGeometry {
  return path(width, height, [
    ['M', 0, 0],
    ['L', width, 0],
    ['L', width, height],
    ['L', 0, height],
    ['Z'],
  ]);
}

function diamond(width: number, height: number): EditorBuiltInShapePathGeometry {
  return path(width, height, [
    ['M', width / 2, 0],
    ['L', width, height / 2],
    ['L', width / 2, height],
    ['L', 0, height / 2],
    ['Z'],
  ]);
}

function ellipse(width: number, height: number): EditorBuiltInShapePathGeometry {
  const kappa = 0.5522847498;
  const rx = width / 2;
  const ry = height / 2;
  const cx = rx;
  const cy = ry;
  return path(width, height, [
    ['M', cx, 0],
    ['C', cx + rx * kappa, 0, width, cy - ry * kappa, width, cy],
    ['C', width, cy + ry * kappa, cx + rx * kappa, height, cx, height],
    ['C', cx - rx * kappa, height, 0, cy + ry * kappa, 0, cy],
    ['C', 0, cy - ry * kappa, cx - rx * kappa, 0, cx, 0],
    ['Z'],
  ]);
}

function lineGeometry(element: ExcalidrawElementModel): EditorBuiltInShapePolylineGeometry | null {
  const fallbackPoints: readonly (readonly [number, number])[] = [
    [0, 0],
    [element.width, element.height],
  ];
  const points = element.points.length > 0 ? element.points : fallbackPoints;
  if (points.length < 2) {
    return null;
  }

  const { maxX, maxY, minX, minY } = measureExcalidrawPoints(points);
  return {
    type: 'polyline',
    viewBox: viewBox(maxX - minX, maxY - minY),
    points: points.map((point) => [point[0] - minX, point[1] - minY] as const),
    closed: false,
  };
}

export function createExcalidrawElementGeometry(
  element: ExcalidrawElementModel
): EditorBuiltInShapeGeometryDefinition | null {
  const width = Math.max(1, Math.abs(element.width));
  const height = Math.max(1, Math.abs(element.height));
  switch (element.type) {
    case 'rectangle':
      return rectangle(width, height);
    case 'diamond':
      return diamond(width, height);
    case 'ellipse':
      return ellipse(width, height);
    case 'line':
    case 'arrow':
    case 'draw':
    case 'freedraw':
      return lineGeometry(element);
    case 'text':
      return rectangle(width, height);
    default:
      return null;
  }
}

function shiftCommand(
  command: EditorBuiltInShapePathCommand,
  dx: number,
  dy: number
): EditorBuiltInShapePathCommand {
  switch (command[0]) {
    case 'M':
    case 'L':
      return [command[0], command[1] + dx, command[2] + dy];
    case 'Q':
      return [command[0], command[1] + dx, command[2] + dy, command[3] + dx, command[4] + dy];
    case 'C':
      return [
        command[0],
        command[1] + dx,
        command[2] + dy,
        command[3] + dx,
        command[4] + dy,
        command[5] + dx,
        command[6] + dy,
      ];
    case 'A':
      return [
        command[0],
        command[1],
        command[2],
        command[3],
        command[4],
        command[5],
        command[6] + dx,
        command[7] + dy,
      ];
    case 'Z':
      return command;
  }
}

function geometryToPaths(
  mapped: ExcalidrawMappedElement,
  origin: { left: number; top: number }
): readonly EditorBuiltInShapePathPrimitive[] {
  const dx = mapped.bounds.left - origin.left;
  const dy = mapped.bounds.top - origin.top;
  if (mapped.geometry.type === 'path') {
    return mapped.geometry.paths.map((primitive) => ({
      commands: primitive.commands.map((command) => shiftCommand(command, dx, dy)),
      ...(primitive.fillRule ? { fillRule: primitive.fillRule } : {}),
    }));
  }

  const [first, ...rest] = mapped.geometry.points;
  if (!first) {
    return [];
  }
  return [
    {
      commands: [
        ['M', first[0] + dx, first[1] + dy],
        ...rest.map((point) => ['L', point[0] + dx, point[1] + dy] as const),
        ...(mapped.geometry.closed ? ([['Z']] as const) : []),
      ],
    },
  ];
}

export function combineExcalidrawElementGeometries(
  mappedElements: readonly ExcalidrawMappedElement[]
): EditorBuiltInShapeGeometryDefinition | null {
  if (mappedElements.length === 0) {
    return null;
  }
  if (mappedElements.length === 1) {
    return mappedElements[0]?.geometry ?? null;
  }

  const left = Math.min(...mappedElements.map((item) => item.bounds.left));
  const top = Math.min(...mappedElements.map((item) => item.bounds.top));
  const right = Math.max(...mappedElements.map((item) => item.bounds.left + item.bounds.width));
  const bottom = Math.max(...mappedElements.map((item) => item.bounds.top + item.bounds.height));
  const paths = mappedElements.flatMap((item) => geometryToPaths(item, { left, top }));
  return paths.length > 0
    ? { type: 'path', viewBox: viewBox(right - left, bottom - top), paths }
    : null;
}
