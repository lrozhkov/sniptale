import {
  EDITOR_BUILT_IN_SHAPE_CATALOG,
  EDITOR_BUILT_IN_SHAPE_CATEGORY,
  getEditorBuiltInShapeEntry,
  searchEditorBuiltInShapes,
} from './index';
import { translate, type TranslationKey } from '../../../../platform/i18n';
import type { EditorBuiltInShapeGeometryDefinition } from './index';

export const REQUIRED_CATEGORY_IDS = [
  EDITOR_BUILT_IN_SHAPE_CATEGORY.LINES,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.BASIC,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.BLOCK_ARROWS,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.EQUATION,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.FLOWCHART,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.CALLOUTS,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.STARS_BANNERS,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.ACTION_BUTTONS,
] as const;

export const REQUIRED_ENTRY_IDS = [
  'line',
  'arrow',
  'block-arrow',
  'rectangle',
  'oval',
  'straight-connector',
  'elbow-connector',
  'curved-connector',
  'double-line-arrow',
  'rounded-rectangle',
  'triangle',
  'right-triangle',
  'diamond',
  'parallelogram',
  'trapezoid',
  'pentagon',
  'hexagon',
  'octagon',
  'plus',
  'cross',
  'left-bracket',
  'left-brace',
  'arc',
  'pie',
  'chord',
  'right-arrow',
  'left-arrow',
  'up-arrow',
  'down-arrow',
  'left-right-arrow',
  'quad-arrow',
  'notched-right-arrow',
  'striped-right-arrow',
  'circular-arrow',
  'math-plus',
  'math-minus',
  'math-multiply',
  'math-divide',
  'math-equal',
  'math-not-equal',
  'flowchart-process',
  'flowchart-decision',
  'flowchart-data',
  'flowchart-document',
  'flowchart-terminator',
  'flowchart-manual-input',
  'flowchart-preparation',
  'flowchart-connector',
  'flowchart-offpage-connector',
  'flowchart-delay',
  'flowchart-display',
  'flowchart-stored-data',
  'flowchart-database',
  'dynamic-callout',
  'rect-callout',
  'round-rect-callout',
  'cloud-callout',
  'line-callout',
  'right-arrow-callout',
  'star-5',
  'star-16',
  'burst-12',
  'ribbon',
  'scroll',
  'action-button-home',
  'action-button-information',
] as const;

export function findIds(query: string): string[] {
  return searchEditorBuiltInShapes(query).map((entry) => entry.id);
}

export function getRequiredEntry(id: string) {
  const entry = getEditorBuiltInShapeEntry(id);
  if (!entry) {
    throw new Error(`Missing catalog entry ${id}`);
  }
  return entry;
}

export function getGeometryBounds(geometry: EditorBuiltInShapeGeometryDefinition) {
  const points = collectPathGeometryPoints(geometry);
  const xValues = points.map(([x]) => x);
  const yValues = points.map(([, y]) => y);

  return {
    maxX: Math.max(...xValues),
    maxY: Math.max(...yValues),
    minX: Math.min(...xValues),
    minY: Math.min(...yValues),
  };
}

export function hasTranslatedLabel(labelKey: TranslationKey): boolean {
  return translate(labelKey, 'ru') !== labelKey;
}

export function isKebabShapeId(id: string): boolean {
  return id.split('-').every((part) => part.length > 0 && isLowerAlphaNumeric(part));
}

function isLowerAlphaNumeric(value: string): boolean {
  return Array.from(value).every((character) => {
    const code = character.charCodeAt(0);
    return (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
  });
}

function collectPathGeometryPoints(
  geometry: EditorBuiltInShapeGeometryDefinition
): Array<readonly [number, number]> {
  if (geometry.type === 'polyline') {
    return [...geometry.points];
  }

  return geometry.paths.flatMap((path) =>
    path.commands.flatMap((command): Array<readonly [number, number]> => {
      switch (command[0]) {
        case 'M':
        case 'L':
          return [[command[1], command[2]]];
        case 'Q':
          return [
            [command[1], command[2]],
            [command[3], command[4]],
          ];
        case 'C':
          return [
            [command[1], command[2]],
            [command[3], command[4]],
            [command[5], command[6]],
          ];
        case 'A':
          return [[command[6], command[7]]];
        case 'Z':
          return [];
      }
    })
  );
}

export function getCatalogIds() {
  return {
    categories: new Set(EDITOR_BUILT_IN_SHAPE_CATALOG.map((entry) => entry.category)),
    entries: new Set(EDITOR_BUILT_IN_SHAPE_CATALOG.map((entry) => entry.id)),
  };
}
