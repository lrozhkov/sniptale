import { BLOCK_ARROW_SHAPE_ENTRIES } from './entries-arrows-equation';
import { BASIC_EXTRA_SHAPE_ENTRIES } from './entries-basic-extra';
import { CALLOUT_SHAPE_ENTRIES } from './entries-callouts';
import { EQUATION_SHAPE_ENTRIES } from './entries-equation';
import { FLOWCHART_SHAPE_ENTRIES } from './entries-flowchart-callouts';
import { LINE_AND_BASIC_SHAPE_ENTRIES } from './entries-lines-basic';
import {
  ACTION_BUTTON_SHAPE_ENTRIES,
  STAR_AND_BANNER_SHAPE_ENTRIES,
} from './entries-stars-actions';

export const PRIMARY_BUILT_IN_SHAPE_IDS = ['block-arrow', 'rectangle', 'oval'] as const;

export const EDITOR_BUILT_IN_SHAPE_CATALOG = [
  ...LINE_AND_BASIC_SHAPE_ENTRIES,
  ...BASIC_EXTRA_SHAPE_ENTRIES,
  ...BLOCK_ARROW_SHAPE_ENTRIES,
  ...EQUATION_SHAPE_ENTRIES,
  ...FLOWCHART_SHAPE_ENTRIES,
  ...CALLOUT_SHAPE_ENTRIES,
  ...STAR_AND_BANNER_SHAPE_ENTRIES,
  ...ACTION_BUTTON_SHAPE_ENTRIES,
] as const;

export type EditorBuiltInShapeId = (typeof EDITOR_BUILT_IN_SHAPE_CATALOG)[number]['id'];
export type EditorPrimaryBuiltInShapeId = (typeof PRIMARY_BUILT_IN_SHAPE_IDS)[number];
