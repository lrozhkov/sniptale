import type {
  EditorBuiltInShapePathCommand,
  EditorBuiltInShapePathPrimitive,
  EditorBuiltInShapeViewBox,
} from '../../../features/editor/document/rich-shape';
import { createCustomShapeImportDiagnostic } from './diagnostics';
import { parseSvgPathData } from './path-data';
import type { CustomShapeImportDiagnostic } from './types';

function parseNumberAttribute(element: Element, name: string): number | null {
  const value = element.getAttribute(name);
  if (value === null || value.trim() === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function parseSvgViewBox(svg: Element): EditorBuiltInShapeViewBox | null {
  const raw = svg.getAttribute('viewBox');
  if (raw) {
    const values = raw
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const [minX, minY, width, height] = values;
    if (values.length === 4 && values.every(Number.isFinite) && width! > 0 && height! > 0) {
      return { minX: minX!, minY: minY!, width: width!, height: height! };
    }
  }

  const width = parseNumberAttribute(svg, 'width');
  const height = parseNumberAttribute(svg, 'height');
  return width && height && width > 0 && height > 0 ? { minX: 0, minY: 0, width, height } : null;
}

function rectCommands(element: Element): EditorBuiltInShapePathCommand[] | null {
  const x = parseNumberAttribute(element, 'x') ?? 0;
  const y = parseNumberAttribute(element, 'y') ?? 0;
  const width = parseNumberAttribute(element, 'width');
  const height = parseNumberAttribute(element, 'height');
  return width && height && width > 0 && height > 0
    ? [['M', x, y], ['L', x + width, y], ['L', x + width, y + height], ['L', x, y + height], ['Z']]
    : null;
}

function ellipseCommands(
  element: Element,
  circle: boolean
): EditorBuiltInShapePathCommand[] | null {
  const cx = parseNumberAttribute(element, 'cx') ?? 0;
  const cy = parseNumberAttribute(element, 'cy') ?? 0;
  const rx = circle ? parseNumberAttribute(element, 'r') : parseNumberAttribute(element, 'rx');
  const ry = circle ? parseNumberAttribute(element, 'r') : parseNumberAttribute(element, 'ry');
  return rx && ry && rx > 0 && ry > 0
    ? [
        ['M', cx - rx, cy],
        ['A', rx, ry, 0, 1, 0, cx + rx, cy],
        ['A', rx, ry, 0, 1, 0, cx - rx, cy],
        ['Z'],
      ]
    : null;
}

function lineCommands(element: Element): EditorBuiltInShapePathCommand[] | null {
  const x1 = parseNumberAttribute(element, 'x1') ?? 0;
  const y1 = parseNumberAttribute(element, 'y1') ?? 0;
  const x2 = parseNumberAttribute(element, 'x2');
  const y2 = parseNumberAttribute(element, 'y2');
  return x2 !== null && y2 !== null
    ? [
        ['M', x1, y1],
        ['L', x2, y2],
      ]
    : null;
}

function parsePoints(raw: string | null): readonly (readonly [number, number])[] | null {
  if (!raw) {
    return null;
  }
  const numbers = raw
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (numbers.length < 4 || numbers.length % 2 !== 0 || !numbers.every(Number.isFinite)) {
    return null;
  }

  const points: Array<readonly [number, number]> = [];
  for (let index = 0; index < numbers.length; index += 2) {
    points.push([numbers[index]!, numbers[index + 1]!]);
  }
  return points;
}

function pointCommands(element: Element, closed: boolean): EditorBuiltInShapePathCommand[] | null {
  const points = parsePoints(element.getAttribute('points'));
  if (!points) {
    return null;
  }

  const [first, ...rest] = points;
  return [
    ['M', first![0], first![1]],
    ...rest.map((point) => ['L', point[0], point[1]] as const),
    ...(closed ? [['Z'] as const] : []),
  ];
}

function getElementCommands(element: Element): EditorBuiltInShapePathCommand[] | null {
  const tagName = element.localName.toLowerCase();
  if (tagName === 'path') {
    const data = element.getAttribute('d');
    return data ? parseSvgPathData(data) : null;
  }
  if (tagName === 'rect') {
    return rectCommands(element);
  }
  if (tagName === 'circle' || tagName === 'ellipse') {
    return ellipseCommands(element, tagName === 'circle');
  }
  if (tagName === 'line') {
    return lineCommands(element);
  }
  if (tagName === 'polygon' || tagName === 'polyline') {
    return pointCommands(element, tagName === 'polygon');
  }
  return null;
}

export function collectSvgPathPrimitives(
  root: Element,
  diagnostics: CustomShapeImportDiagnostic[]
) {
  const primitives: EditorBuiltInShapePathPrimitive[] = [];
  for (const element of Array.from(
    root.querySelectorAll('path, polygon, polyline, rect, circle, ellipse, line')
  )) {
    const commands = getElementCommands(element);
    if (!commands) {
      diagnostics.push(
        createCustomShapeImportDiagnostic(
          'skipped-element',
          'SVG element could not be normalized.',
          element.localName,
          'warning'
        )
      );
    } else {
      primitives.push({ commands });
    }
  }
  return primitives;
}
