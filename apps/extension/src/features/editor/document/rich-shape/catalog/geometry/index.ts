import { ARROW_GEOMETRY } from './arrows';
import { BASIC_GEOMETRY } from './basic';
import { DECORATIVE_GEOMETRY } from './decorative';
import { FLOWCHART_GEOMETRY } from './flowchart';
import type { GeometryMap } from './primitives';

export const SHAPE_GEOMETRY = {
  ...BASIC_GEOMETRY,
  ...ARROW_GEOMETRY,
  ...FLOWCHART_GEOMETRY,
  ...DECORATIVE_GEOMETRY,
} satisfies GeometryMap;
