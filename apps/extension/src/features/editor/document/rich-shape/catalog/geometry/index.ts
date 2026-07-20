import { ARROW_GEOMETRY } from './arrows';
import { BASIC_GEOMETRY } from './basic';
import { DECORATIVE_GEOMETRY } from './decorative';
import { FLOW_CALLOUT_GEOMETRY } from './flow-callout';
import type { GeometryMap } from './primitives';

export const SHAPE_GEOMETRY = {
  ...BASIC_GEOMETRY,
  ...ARROW_GEOMETRY,
  ...FLOW_CALLOUT_GEOMETRY,
  ...DECORATIVE_GEOMETRY,
} satisfies GeometryMap;
