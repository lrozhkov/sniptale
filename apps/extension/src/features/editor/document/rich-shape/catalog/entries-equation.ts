import { defineShapeEntry } from './entry-builders';
import { EDITOR_RICH_SHAPE_FAMILY } from './families';
import { SHAPE_GEOMETRY } from './geometry/index';
import { EDITOR_BUILT_IN_SHAPE_CATEGORY } from './types';

export const EQUATION_SHAPE_ENTRIES = [
  defineShapeEntry({
    id: 'math-plus',
    label: 'Плюс',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.EQUATION,
    family: EDITOR_RICH_SHAPE_FAMILY.EQUATION,
    kind: 'math-plus',
    geometry: SHAPE_GEOMETRY.plus,
    aliases: ['плюс', 'plus', 'math plus'],
  }),
  defineShapeEntry({
    id: 'math-minus',
    label: 'Минус',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.EQUATION,
    family: EDITOR_RICH_SHAPE_FAMILY.EQUATION,
    kind: 'math-minus',
    geometry: SHAPE_GEOMETRY.minus,
    aliases: ['минус', 'minus', 'math minus'],
  }),
  defineShapeEntry({
    id: 'math-multiply',
    label: 'Умножение',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.EQUATION,
    family: EDITOR_RICH_SHAPE_FAMILY.EQUATION,
    kind: 'math-multiply',
    geometry: SHAPE_GEOMETRY.cross,
    aliases: ['умножение', 'multiply', 'times', 'multiplication'],
  }),
  defineShapeEntry({
    id: 'math-divide',
    label: 'Деление',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.EQUATION,
    family: EDITOR_RICH_SHAPE_FAMILY.EQUATION,
    kind: 'math-divide',
    geometry: SHAPE_GEOMETRY.divide,
    aliases: ['деление', 'divide', 'division'],
  }),
  defineShapeEntry({
    id: 'math-equal',
    label: 'Равно',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.EQUATION,
    family: EDITOR_RICH_SHAPE_FAMILY.EQUATION,
    kind: 'math-equal',
    geometry: SHAPE_GEOMETRY.equal,
    aliases: ['равно', 'equals', 'equal'],
  }),
  defineShapeEntry({
    id: 'math-not-equal',
    label: 'Не равно',
    category: EDITOR_BUILT_IN_SHAPE_CATEGORY.EQUATION,
    family: EDITOR_RICH_SHAPE_FAMILY.EQUATION,
    kind: 'math-not-equal',
    geometry: SHAPE_GEOMETRY.notEqual,
    aliases: ['не равно', 'not equal', 'not equals'],
  }),
] as const;
