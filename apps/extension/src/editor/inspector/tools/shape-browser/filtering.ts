import { getShapeBrowserEntryLabel, SHAPE_BROWSER_CATEGORY_ORDER } from './data';
import type {
  ShapeBrowserCategory,
  ShapeBrowserCategoryGroup,
  ShapeBrowserEntry,
  ShapeBrowserSourceFilter,
} from './types';

function normalizeSearchToken(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ');
}

function matchesSourceFilter(entry: ShapeBrowserEntry, filter: ShapeBrowserSourceFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'rough-capable') {
    return entry.roughCapable;
  }

  return entry.source === filter;
}

function getSearchHaystack(entry: ShapeBrowserEntry): string {
  return [
    entry.id,
    entry.insertKind,
    entry.labelFallback,
    getShapeBrowserEntryLabel(entry),
    entry.category,
    entry.source,
    ...entry.searchAliases,
    ...entry.tags,
  ]
    .map(normalizeSearchToken)
    .join(' ');
}

function matchesQuery(entry: ShapeBrowserEntry, query: string): boolean {
  const normalizedQuery = normalizeSearchToken(query);
  return !normalizedQuery || getSearchHaystack(entry).includes(normalizedQuery);
}

function getCategoryRank(category: ShapeBrowserCategory): number {
  const index = SHAPE_BROWSER_CATEGORY_ORDER.indexOf(category);
  return index === -1 ? SHAPE_BROWSER_CATEGORY_ORDER.length : index;
}

export function filterShapeBrowserEntries(args: {
  entries: readonly ShapeBrowserEntry[];
  query: string;
  sourceFilter: ShapeBrowserSourceFilter;
}): ShapeBrowserEntry[] {
  return args.entries.filter(
    (entry) => matchesSourceFilter(entry, args.sourceFilter) && matchesQuery(entry, args.query)
  );
}

export function groupShapeBrowserEntries(
  entries: readonly ShapeBrowserEntry[]
): ShapeBrowserCategoryGroup[] {
  const groupsByCategory = new Map<ShapeBrowserCategory, ShapeBrowserEntry[]>();
  entries.forEach((entry) => {
    groupsByCategory.set(entry.category, [...(groupsByCategory.get(entry.category) ?? []), entry]);
  });

  return [...groupsByCategory.entries()]
    .sort(([left], [right]) => getCategoryRank(left) - getCategoryRank(right))
    .map(([category, groupEntries]) => ({ category, entries: groupEntries }));
}
