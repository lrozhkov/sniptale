import {
  EDITOR_BUILT_IN_SHAPE_CATALOG,
  EDITOR_BUILT_IN_SHAPE_CATEGORY,
  PRIMARY_BUILT_IN_SHAPE_IDS,
  type EditorBuiltInShapeCatalogEntry,
} from '../../../../features/editor/document/rich-shape';
import { translate } from '../../../../platform/i18n';
import type { ShapeBrowserCategory, ShapeBrowserEntry, ShapeBrowserSourceFilter } from './types';

export const SHAPE_BROWSER_CATEGORY_ORDER: readonly ShapeBrowserCategory[] = [
  EDITOR_BUILT_IN_SHAPE_CATEGORY.LINES,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.BASIC,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.BLOCK_ARROWS,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.EQUATION,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.FLOWCHART,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.CALLOUTS,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.STARS_BANNERS,
  EDITOR_BUILT_IN_SHAPE_CATEGORY.ACTION_BUTTONS,
  'custom',
  'imported',
];

export const SHAPE_BROWSER_SOURCE_FILTERS: readonly ShapeBrowserSourceFilter[] = [
  'all',
  'built-in',
  'custom',
  'imported-library',
  'rough-capable',
];

export function createBuiltInShapeBrowserEntries(
  catalog: readonly EditorBuiltInShapeCatalogEntry[] = EDITOR_BUILT_IN_SHAPE_CATALOG
): ShapeBrowserEntry[] {
  return catalog.map((entry) => ({
    id: entry.id,
    labelKey: entry.labelKey,
    labelFallback: entry.labelFallback,
    category: entry.category,
    source: 'built-in',
    searchAliases: entry.searchAliases,
    tags: entry.tags,
    thumbnail: entry.thumbnail,
    insertKind: entry.insertDefaults.shapeKind,
    roughCapable: true,
  }));
}

export function getShapeBrowserEntryLabel(entry: ShapeBrowserEntry): string {
  return entry.labelKey ? translate(entry.labelKey) : entry.labelFallback;
}

export function getShapeBrowserCategoryLabel(category: ShapeBrowserCategory): string {
  return translate(`editor.shapeCatalog.categories.${category}`);
}

export function getShapeBrowserSourceFilterLabel(filter: ShapeBrowserSourceFilter): string {
  const keyByFilter = {
    all: 'sourceAll',
    'built-in': 'sourceBuiltIn',
    custom: 'sourceCustom',
    'imported-library': 'sourceImported',
    'rough-capable': 'sourceRough',
  } as const;

  return translate(`editor.shapeCatalog.browser.${keyByFilter[filter]}`);
}

export function getPrimaryShapeBrowserEntries(entries: readonly ShapeBrowserEntry[]) {
  return PRIMARY_BUILT_IN_SHAPE_IDS.map((id) => entries.find((entry) => entry.id === id)).filter(
    (entry): entry is ShapeBrowserEntry => Boolean(entry)
  );
}
