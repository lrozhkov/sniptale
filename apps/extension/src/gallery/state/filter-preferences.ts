// policyStateIds: [] - folder and scope sets are immutable parser allowlists; localStorage only
// preserves advisory Gallery navigation state.
import { runWithPersistenceMutationPermit } from '../../composition/persistence/infrastructure/mutation-barrier';
import type { FolderFilter, GalleryFacetFilters, GalleryScope } from './types';

const GALLERY_FILTERS_STORAGE_KEY = 'sniptale.gallery.filters';

const FOLDERS = new Set<string>([
  'all',
  'screenshot',
  'recording',
  'export',
  'web-snapshot',
  'scenario',
]);
const SCOPES = new Set<string>(['all', 'library', 'temporary']);
const FACET_IDS = [
  'created',
  'duration',
  'format',
  'resolution',
  'size',
  'source',
  'updated',
] as const;

export interface GalleryFilterPreferences {
  activeSavedViewId: string | null;
  activeTags: string[];
  facetFilters: GalleryFacetFilters;
  folderFilter: FolderFilter;
  scope: GalleryScope;
}

function getLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function parseStringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const result: string[] = [];
  const entries: unknown[] = value;
  for (const entry of entries) {
    if (typeof entry !== 'string' || entry.length > 256) return null;
    result.push(entry);
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFolderFilter(value: unknown): value is FolderFilter {
  return typeof value === 'string' && FOLDERS.has(value);
}

function isGalleryScope(value: unknown): value is GalleryScope {
  return typeof value === 'string' && SCOPES.has(value);
}

function parseFilterPreferences(value: unknown): GalleryFilterPreferences | null {
  if (!isRecord(value)) return null;
  const record = value;
  if (record['version'] !== 1) return null;
  const folderFilter = record['folderFilter'];
  const scope = record['scope'];
  const activeTags = parseStringList(record['activeTags']);
  const facets = record['facetFilters'];
  const activeSavedViewId = record['activeSavedViewId'];
  if (
    activeSavedViewId !== undefined &&
    activeSavedViewId !== null &&
    (typeof activeSavedViewId !== 'string' || activeSavedViewId.length > 128)
  ) {
    return null;
  }
  if (!isFolderFilter(folderFilter) || !isGalleryScope(scope) || !activeTags || !isRecord(facets)) {
    return null;
  }
  const parsedFacets = FACET_IDS.map((id) => parseStringList(facets[id]));
  if (parsedFacets.some((entry) => entry === null)) return null;
  const facetFilters: GalleryFacetFilters = {
    created: parsedFacets[0]!,
    duration: parsedFacets[1]!,
    format: parsedFacets[2]!,
    resolution: parsedFacets[3]!,
    size: parsedFacets[4]!,
    source: parsedFacets[5]!,
    updated: parsedFacets[6]!,
  };

  return {
    activeSavedViewId: typeof activeSavedViewId === 'string' ? activeSavedViewId : null,
    activeTags,
    facetFilters,
    folderFilter,
    scope,
  };
}

export function readGalleryFilterPreferences(): GalleryFilterPreferences | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  try {
    const stored = storage.getItem(GALLERY_FILTERS_STORAGE_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return parseFilterPreferences(parsed);
  } catch {
    return null;
  }
}

export function writeGalleryFilterPreferences(value: GalleryFilterPreferences): Promise<void> {
  const storage = getLocalStorage();
  if (!storage) return Promise.resolve();
  return runWithPersistenceMutationPermit(() => {
    try {
      storage.setItem(GALLERY_FILTERS_STORAGE_KEY, JSON.stringify({ ...value, version: 1 }));
    } catch {
      // Advisory navigation state must fail soft.
    }
  });
}
