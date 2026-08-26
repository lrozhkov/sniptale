// policyStateIds: [] - facet identifiers are immutable parser allowlists; localStorage only
// preserves advisory Gallery navigation state.
import { runWithPersistenceMutationPermit } from '../../../composition/persistence/infrastructure/mutation-barrier';
import type { GalleryFacetId } from '../types';

const STORAGE_KEY = 'sniptale.gallery.facet-disclosures';
const ALL_FACET_IDS = new Set<GalleryFacetId>([
  'status',
  'tags',
  'created',
  'duration',
  'format',
  'resolution',
  'size',
  'source',
  'updated',
]);
const DEFAULT_OPEN_FACET_IDS: GalleryFacetId[] = ['status', 'tags'];

function getLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readGalleryFacetDisclosurePreferences(): GalleryFacetId[] {
  const storage = getLocalStorage();
  if (!storage) return DEFAULT_OPEN_FACET_IDS;
  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_OPEN_FACET_IDS;
    const parsed: unknown = JSON.parse(stored);
    if (
      !Array.isArray(parsed) ||
      parsed.length > ALL_FACET_IDS.size ||
      parsed.some(
        (entry) => typeof entry !== 'string' || !ALL_FACET_IDS.has(entry as GalleryFacetId)
      )
    ) {
      return DEFAULT_OPEN_FACET_IDS;
    }
    return parsed as GalleryFacetId[];
  } catch {
    return DEFAULT_OPEN_FACET_IDS;
  }
}

export function writeGalleryFacetDisclosurePreferences(ids: GalleryFacetId[]): Promise<void> {
  const storage = getLocalStorage();
  if (!storage) return Promise.resolve();
  return runWithPersistenceMutationPermit(() => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Advisory navigation state must fail soft.
    }
  });
}
