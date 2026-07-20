import { defineShapeEntry } from './entry-builders';
import { EDITOR_RICH_SHAPE_FAMILY } from './families';
import { SHAPE_GEOMETRY } from './geometry/index';
import { EDITOR_BUILT_IN_SHAPE_CATEGORY } from './types';

export const CALLOUT_SHAPE_ENTRIES = [
  defineShapeEntry({
    id: 'dynamic-callout',
    label: 'Выноска',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.CALLOUTS,
    family: EDITOR_RICH_SHAPE_FAMILY.CALLOUT,
    kind: 'dynamic-callout',
    geometry: SHAPE_GEOMETRY.callout,
    aliases: ['выноска', 'callout', 'dynamic callout', 'speech bubble'],
  }),
  defineShapeEntry({
    id: 'rect-callout',
    label: 'Прямоугольная выноска',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.CALLOUTS,
    family: EDITOR_RICH_SHAPE_FAMILY.CALLOUT,
    kind: 'rect-callout',
    geometry: SHAPE_GEOMETRY.callout,
    aliases: ['прямоугольная выноска', 'callout', 'speech bubble'],
  }),
  defineShapeEntry({
    id: 'round-rect-callout',
    label: 'Скругленная выноска',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.CALLOUTS,
    family: EDITOR_RICH_SHAPE_FAMILY.CALLOUT,
    kind: 'round-rect-callout',
    geometry: SHAPE_GEOMETRY.callout,
    aliases: ['скругленная выноска', 'rounded callout', 'rounded speech bubble'],
  }),
  defineShapeEntry({
    id: 'oval-callout',
    label: 'Овальная выноска',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.CALLOUTS,
    family: EDITOR_RICH_SHAPE_FAMILY.CALLOUT,
    kind: 'oval-callout',
    geometry: SHAPE_GEOMETRY.ellipse,
    aliases: ['овальная выноска', 'oval callout', 'bubble'],
  }),
  defineShapeEntry({
    id: 'cloud-callout',
    label: 'Облачная выноска',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.CALLOUTS,
    family: EDITOR_RICH_SHAPE_FAMILY.CALLOUT,
    kind: 'cloud-callout',
    geometry: SHAPE_GEOMETRY.cloud,
    aliases: ['облачная выноска', 'cloud callout', 'thought bubble'],
  }),
  defineShapeEntry({
    id: 'line-callout',
    label: 'Линейная выноска',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.CALLOUTS,
    family: EDITOR_RICH_SHAPE_FAMILY.CALLOUT,
    kind: 'line-callout',
    geometry: SHAPE_GEOMETRY.callout,
    aliases: ['линейная выноска', 'line callout', 'leader callout'],
  }),
  defineShapeEntry({
    id: 'right-arrow-callout',
    label: 'Выноска со стрелкой вправо',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.CALLOUTS,
    family: EDITOR_RICH_SHAPE_FAMILY.CALLOUT,
    kind: 'right-arrow-callout',
    geometry: SHAPE_GEOMETRY.rightArrow,
    aliases: ['выноска со стрелкой вправо', 'right arrow callout', 'arrow callout'],
  }),
] as const;
