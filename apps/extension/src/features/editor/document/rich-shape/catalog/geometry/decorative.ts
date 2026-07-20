import { path, paths, polygon, star, type GeometryMap } from './primitives';

const mathSymbolBars = {
  minus: [
    polygon([
      [18, 44],
      [82, 44],
      [82, 56],
      [18, 56],
    ]),
  ],
  equal: [
    polygon([
      [18, 34],
      [82, 34],
      [82, 46],
      [18, 46],
    ]),
    polygon([
      [18, 58],
      [82, 58],
      [82, 70],
      [18, 70],
    ]),
  ],
  'not-equal': [
    polygon([
      [18, 34],
      [82, 34],
      [82, 46],
      [18, 46],
    ]),
    polygon([
      [18, 58],
      [82, 58],
      [82, 70],
      [18, 70],
    ]),
    polygon([
      [62, 18],
      [74, 18],
      [38, 84],
      [26, 84],
    ]),
  ],
  divide: [
    circle(50, 24, 7),
    polygon([
      [18, 44],
      [82, 44],
      [82, 56],
      [18, 56],
    ]),
    circle(50, 76, 7),
  ],
};

function circle(cx: number, cy: number, radius: number) {
  const k = radius * 0.5522847498;
  return path([
    ['M', cx, cy - radius],
    ['C', cx + k, cy - radius, cx + radius, cy - k, cx + radius, cy],
    ['C', cx + radius, cy + k, cx + k, cy + radius, cx, cy + radius],
    ['C', cx - k, cy + radius, cx - radius, cy + k, cx - radius, cy],
    ['C', cx - radius, cy - k, cx - k, cy - radius, cx, cy - radius],
    ['Z'],
  ]);
}

function mathSymbol(kind: 'minus' | 'equal' | 'not-equal' | 'divide') {
  const bars = mathSymbolBars[kind];
  return paths(bars.flatMap((item) => item.paths));
}

export const DECORATIVE_GEOMETRY = {
  burst12: star(12, 32, 44),
  star4: star(4, 17, 44),
  star5: star(5),
  star8: star(8, 24, 44),
  star16: star(16, 33, 44),
  ribbon: polygon([
    [12, 22],
    [88, 22],
    [76, 50],
    [88, 78],
    [12, 78],
    [24, 50],
  ]),
  doubleRibbon: polygon([
    [8, 28],
    [42, 28],
    [50, 16],
    [58, 28],
    [92, 28],
    [78, 50],
    [92, 72],
    [58, 72],
    [50, 84],
    [42, 72],
    [8, 72],
    [22, 50],
  ]),
  wave: path([
    ['M', 12, 62],
    ['C', 30, 34, 54, 86, 88, 42],
    ['L', 88, 70],
    ['C', 54, 96, 30, 50, 12, 82],
    ['Z'],
  ]),
  scroll: path([
    ['M', 18, 18],
    ['C', 8, 18, 8, 38, 22, 38],
    ['L', 78, 38],
    ['C', 92, 38, 92, 18, 78, 18],
    ['Z'],
    ['M', 22, 38],
    ['L', 22, 82],
    ['L', 78, 82],
    ['L', 78, 38],
  ]),
  minus: mathSymbol('minus'),
  equal: mathSymbol('equal'),
  notEqual: mathSymbol('not-equal'),
  divide: mathSymbol('divide'),
} satisfies GeometryMap;
