import type { ShapeBrowserEntry } from './';

export function createCustomShapeBrowserEntry(
  overrides: Partial<ShapeBrowserEntry> = {}
): ShapeBrowserEntry {
  return {
    id: 'custom-widget',
    labelFallback: 'Custom widget',
    category: 'custom',
    source: 'custom',
    searchAliases: ['виджет', 'widget'],
    tags: ['custom'],
    thumbnail: null,
    insertKind: 'custom-shape',
    roughCapable: false,
    ...overrides,
  };
}
