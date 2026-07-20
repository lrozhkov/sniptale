import { path, paths, polygon, type GeometryMap, type Point } from './primitives';

function blockArrow(direction: 'right' | 'left' | 'up' | 'down') {
  const right: readonly Point[] = [
    [8, 32],
    [58, 32],
    [58, 14],
    [92, 50],
    [58, 86],
    [58, 68],
    [8, 68],
  ];
  const transforms = {
    right: (point: Point): Point => point,
    left: ([x, y]: Point): Point => [100 - x, y],
    up: ([x, y]: Point): Point => [y, x],
    down: ([x, y]: Point): Point => [y, 100 - x],
  };
  return polygon(right.map(transforms[direction]));
}

function bidirectionalArrow(axis: 'horizontal' | 'vertical') {
  const horizontal = [
    [8, 50],
    [32, 22],
    [32, 38],
    [68, 38],
    [68, 22],
    [92, 50],
    [68, 78],
    [68, 62],
    [32, 62],
    [32, 78],
  ] satisfies readonly Point[];

  return polygon(axis === 'horizontal' ? horizontal : horizontal.map(([x, y]) => [y, x]));
}

const QUAD_ARROW_POINTS: readonly Point[] = [
  [50, 6],
  [66, 24],
  [58, 24],
  [58, 42],
  [76, 42],
  [76, 34],
  [94, 50],
  [76, 66],
  [76, 58],
  [58, 58],
  [58, 76],
  [66, 76],
  [50, 94],
  [34, 76],
  [42, 76],
  [42, 58],
  [24, 58],
  [24, 66],
  [6, 50],
  [24, 34],
  [24, 42],
  [42, 42],
  [42, 24],
  [34, 24],
];

export const ARROW_GEOMETRY = {
  rightArrow: blockArrow('right'),
  leftArrow: blockArrow('left'),
  upArrow: blockArrow('up'),
  downArrow: blockArrow('down'),
  leftRightArrow: bidirectionalArrow('horizontal'),
  upDownArrow: bidirectionalArrow('vertical'),
  quadArrow: polygon(QUAD_ARROW_POINTS),
  notchedRightArrow: polygon([
    [8, 28],
    [58, 28],
    [58, 12],
    [92, 50],
    [58, 88],
    [58, 72],
    [8, 72],
    [24, 50],
  ]),
  stripedRightArrow: paths([
    ...polygon([
      [30, 30],
      [60, 30],
      [60, 14],
      [92, 50],
      [60, 86],
      [60, 70],
      [30, 70],
    ]).paths,
    ...polygon([
      [8, 30],
      [16, 30],
      [16, 70],
      [8, 70],
    ]).paths,
    ...polygon([
      [20, 30],
      [26, 30],
      [26, 70],
      [20, 70],
    ]).paths,
  ]),
  chevron: polygon([
    [18, 12],
    [82, 50],
    [18, 88],
    [34, 50],
  ]),
  leftRightChevron: paths([
    ...polygon([
      [8, 50],
      [38, 14],
      [50, 14],
      [26, 50],
      [50, 86],
      [38, 86],
    ]).paths,
    ...polygon([
      [50, 14],
      [92, 50],
      [50, 86],
      [62, 50],
    ]).paths,
  ]),
  curvedArrow: path([
    ['M', 18, 82],
    ['C', 18, 34, 54, 16, 74, 32],
    ['L', 76, 16],
    ['L', 94, 50],
    ['L', 58, 44],
    ['L', 70, 38],
    ['C', 52, 30, 32, 44, 32, 82],
    ['Z'],
  ]),
  uTurnArrow: path([
    ['M', 76, 84],
    ['L', 76, 36],
    ['C', 76, 16, 28, 16, 28, 44],
    ['L', 28, 60],
    ['L', 12, 60],
    ['L', 36, 88],
    ['L', 60, 60],
    ['L', 44, 60],
    ['L', 44, 44],
    ['C', 44, 34, 60, 34, 60, 44],
    ['L', 60, 84],
    ['Z'],
  ]),
  circularArrow: path([
    ['M', 84, 50],
    ['A', 34, 34, 0, 1, 1, 50, 16],
    ['L', 50, 4],
    ['L', 88, 22],
    ['L', 50, 40],
    ['L', 50, 28],
    ['A', 22, 22, 0, 1, 0, 72, 50],
    ['Z'],
  ]),
} satisfies GeometryMap;
