import { path, paths, polygon, type GeometryMap } from './primitives';

export const FLOW_CALLOUT_GEOMETRY = {
  predefinedProcess: paths([
    ...polygon([
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]).paths,
    {
      commands: [
        ['M', 16, 0],
        ['L', 16, 100],
      ],
    },
    {
      commands: [
        ['M', 84, 0],
        ['L', 84, 100],
      ],
    },
  ]),
  document: path([
    ['M', 0, 0],
    ['L', 100, 0],
    ['L', 100, 74],
    ['C', 74, 100, 34, 54, 0, 84],
    ['Z'],
  ]),
  storedData: path([
    ['M', 20, 0],
    ['C', 0, 0, 0, 100, 20, 100],
    ['L', 100, 100],
    ['C', 82, 100, 82, 0, 100, 0],
    ['Z'],
  ]),
  database: paths([
    {
      commands: [
        ['M', 0, 18],
        ['C', 0, 0, 100, 0, 100, 18],
        ['L', 100, 82],
        ['C', 100, 100, 0, 100, 0, 82],
        ['Z'],
      ],
    },
    {
      commands: [
        ['M', 0, 18],
        ['C', 0, 36, 100, 36, 100, 18],
      ],
    },
  ]),
  manualInput: polygon(
    [
      [8, 32],
      [92, 14],
      [92, 86],
      [8, 86],
    ],
    { height: 52, left: 16, top: 28, width: 70 }
  ),
  delay: path([['M', 0, 0], ['L', 58, 0], ['C', 100, 0, 100, 100, 58, 100], ['L', 0, 100], ['Z']], {
    height: 64,
    left: 10,
    top: 18,
    width: 64,
  }),
  display: path(
    [
      ['M', 18, 12],
      ['L', 78, 12],
      ['C', 100, 12, 100, 88, 78, 88],
      ['L', 18, 88],
      ['L', 4, 50],
      ['Z'],
    ],
    { height: 56, left: 20, top: 22, width: 58 }
  ),
  callout: path(
    [
      ['M', 10, 12],
      ['L', 90, 12],
      ['L', 90, 70],
      ['L', 58, 70],
      ['L', 40, 92],
      ['L', 42, 70],
      ['L', 10, 70],
      ['Z'],
    ],
    { height: 46, left: 16, top: 18, width: 68 }
  ),
  cloud: path(
    [
      ['M', 24, 82],
      ['C', 4, 82, 2, 54, 24, 50],
      ['C', 20, 30, 42, 18, 58, 30],
      ['C', 70, 14, 96, 28, 90, 50],
      ['C', 98, 58, 96, 86, 74, 82],
      ['Z'],
    ],
    { height: 38, left: 24, top: 38, width: 56 }
  ),
} satisfies GeometryMap;
