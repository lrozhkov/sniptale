import {
  ellipse,
  path,
  polygon,
  polyline,
  plus,
  cross,
  rectangle,
  regularPolygon,
  roundRectangle,
} from './primitives';
import type { GeometryMap } from './primitives';

function bracket(side: 'left' | 'right') {
  const x1 = side === 'left' ? 22 : 78;
  const x2 = side === 'left' ? 70 : 30;
  const textFrame =
    side === 'left'
      ? { height: 68, left: 30, top: 16, width: 58 }
      : { height: 68, left: 12, top: 16, width: 58 };
  return polyline(
    [
      [x2, 8],
      [x1, 8],
      [x1, 92],
      [x2, 92],
    ],
    false,
    textFrame
  );
}

function brace(side: 'left' | 'right') {
  const open = side === 'left' ? 66 : 34;
  const spine = side === 'left' ? 30 : 70;
  const textFrame =
    side === 'left'
      ? { height: 72, left: 38, top: 14, width: 50 }
      : { height: 72, left: 12, top: 14, width: 50 };
  return path(
    [
      ['M', open, 8],
      ['C', spine, 8, spine, 26, spine, 38],
      ['Q', spine, 50, side === 'left' ? 18 : 82, 50],
      ['Q', spine, 50, spine, 62],
      ['C', spine, 74, spine, 92, open, 92],
    ],
    textFrame
  );
}

export const BASIC_GEOMETRY = {
  line: polyline([
    [0, 100],
    [100, 0],
  ]),
  elbowConnector: polyline([
    [14, 78],
    [50, 78],
    [50, 22],
    [86, 22],
  ]),
  curvedConnector: path([
    ['M', 14, 78],
    ['C', 35, 28, 64, 28, 86, 22],
  ]),
  rectangle: rectangle(),
  roundRectangle: roundRectangle(),
  ellipse: ellipse(),
  triangle: regularPolygon(3),
  rightTriangle: polygon([
    [16, 84],
    [84, 84],
    [16, 16],
  ]),
  diamond: regularPolygon(4, -90, 43),
  parallelogram: polygon([
    [26, 12],
    [92, 12],
    [74, 88],
    [8, 88],
  ]),
  trapezoid: polygon([
    [28, 14],
    [72, 14],
    [92, 88],
    [8, 88],
  ]),
  pentagon: regularPolygon(5),
  hexagon: regularPolygon(6, 0),
  octagon: regularPolygon(8, 22.5),
  plus: plus(),
  cross: cross(),
  leftBracket: bracket('left'),
  rightBracket: bracket('right'),
  leftBrace: brace('left'),
  rightBrace: brace('right'),
  arc: path(
    [
      ['M', 5, 78],
      ['C', 18, 18, 82, 18, 95, 78],
    ],
    { height: 52, left: 16, top: 24, width: 68 }
  ),
  pie: path([['M', 0, 100], ['L', 0, 0], ['C', 55, 0, 100, 45, 100, 100], ['Z']], {
    height: 34,
    left: 30,
    top: 46,
    width: 48,
  }),
  chord: path([['M', 0, 42], ['C', 25, 0, 75, 0, 100, 42], ['L', 100, 100], ['L', 0, 100], ['Z']], {
    height: 30,
    left: 18,
    top: 62,
    width: 64,
  }),
} satisfies GeometryMap;
