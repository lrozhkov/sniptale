// policyStateId: gallery-saved-view-mutation-queue - durable browser storage remains
// authoritative while this queue serializes owner-local mutations.
import type { ArchiveRestoreStrategy } from '../assets';
import { browserStorage } from '../infrastructure/browser-storage';
import {
  runWithExclusivePersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import {
  GALLERY_SAVED_VIEWS_STORAGE_KEY,
  GallerySavedViewError,
  MAX_GALLERY_SAVED_VIEWS,
  MAX_GALLERY_SAVED_VIEW_NAME_LENGTH,
  type GallerySavedView,
  type GallerySavedViewFacetFilters,
  type GallerySavedViewFacetId,
  type GallerySavedViewFilterSnapshot,
  type GallerySavedViewFolder,
  type GallerySavedViewMoveDirection,
  type GallerySavedViewScope,
} from './contract';
import { buildGallerySavedViewReplacePlan } from './replace-restore-plan';

export * from './contract';

const MAX_FILTER_VALUES = 100;
const MAX_FILTER_VALUE_LENGTH = 256;
const FOLDERS = new Set<GallerySavedViewFolder>([
  'all',
  'recording',
  'scenario',
  'screenshot',
  'web-snapshot',
]);
const SCOPES = new Set<GallerySavedViewScope>(['all', 'library', 'temporary']);
const FACET_IDS = [
  'created',
  'duration',
  'format',
  'resolution',
  'size',
  'source',
  'updated',
] as const;

interface PersistedGallerySavedViews {
  version: 1;
  views: GallerySavedView[];
}

let mutationQueue: Promise<unknown> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  const actual = Object.keys(value);
  return required.every((key) => key in value) && actual.every((key) => required.includes(key));
}

function parseTimestamp(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function parseStringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_FILTER_VALUES) return null;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (
      typeof entry !== 'string' ||
      entry.length === 0 ||
      entry.length > MAX_FILTER_VALUE_LENGTH ||
      seen.has(entry)
    ) {
      return null;
    }
    seen.add(entry);
    result.push(entry);
  }
  return result;
}

function parseFilters(value: unknown): GallerySavedViewFilterSnapshot | null {
  if (!isRecord(value) || !hasExactKeys(value, ['activeTags', 'facetFilters', 'scope'])) {
    return null;
  }
  const activeTags = parseStringList(value['activeTags']);
  const scope = value['scope'];
  const facets = value['facetFilters'];
  if (!activeTags || !SCOPES.has(scope as GallerySavedViewScope) || !isRecord(facets)) return null;
  if (!hasExactKeys(facets, FACET_IDS)) return null;
  const parsed = Object.fromEntries(
    FACET_IDS.map((id) => [id, parseStringList(facets[id])])
  ) as Record<GallerySavedViewFacetId, string[] | null>;
  if (FACET_IDS.some((id) => parsed[id] === null)) return null;
  return {
    activeTags,
    facetFilters: parsed as GallerySavedViewFacetFilters,
    scope: scope as GallerySavedViewScope,
  };
}

function parseView(value: unknown): GallerySavedView | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['createdAt', 'filters', 'folderFilter', 'id', 'name', 'updatedAt'])
  ) {
    return null;
  }
  const createdAt = parseTimestamp(value['createdAt']);
  const updatedAt = parseTimestamp(value['updatedAt']);
  const filters = parseFilters(value['filters']);
  const name = typeof value['name'] === 'string' ? value['name'].trim() : '';
  if (
    createdAt === null ||
    updatedAt === null ||
    updatedAt < createdAt ||
    !filters ||
    typeof value['id'] !== 'string' ||
    value['id'].length === 0 ||
    value['id'].length > 128 ||
    !FOLDERS.has(value['folderFilter'] as GallerySavedViewFolder) ||
    name.length === 0 ||
    name.length > MAX_GALLERY_SAVED_VIEW_NAME_LENGTH
  ) {
    return null;
  }
  return {
    createdAt,
    filters,
    folderFilter: value['folderFilter'] as GallerySavedViewFolder,
    id: value['id'],
    name,
    updatedAt,
  };
}

export function parsePortableGallerySavedViews(value: unknown): GallerySavedView[] {
  if (!Array.isArray(value) || value.length > MAX_GALLERY_SAVED_VIEWS) {
    throw new GallerySavedViewError('invalid', 'Saved Gallery views are invalid.');
  }
  const views = value.map(parseView);
  if (views.some((view) => view === null)) {
    throw new GallerySavedViewError('invalid', 'Saved Gallery views are invalid.');
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const view of views as GallerySavedView[]) {
    if (ids.has(view.id)) {
      throw new GallerySavedViewError('invalid', 'Saved Gallery view identities are duplicated.');
    }
    const scopedName = `${view.folderFilter}\u0000${nameKey(view.name)}`;
    if (names.has(scopedName)) {
      throw new GallerySavedViewError('invalid', 'Saved Gallery view names are duplicated.');
    }
    ids.add(view.id);
    names.add(scopedName);
  }
  return structuredClone(views as GallerySavedView[]);
}

function parsePersisted(value: unknown): GallerySavedView[] {
  if (value === undefined) return [];
  if (!isRecord(value) || !hasExactKeys(value, ['version', 'views']) || value['version'] !== 1) {
    throw new GallerySavedViewError('invalid', 'Stored Gallery views are invalid.');
  }
  return parsePortableGallerySavedViews(value['views']);
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function nameKey(name: string): string {
  return normalizeName(name).toLocaleLowerCase('en-US');
}

function assertName(name: string): string {
  const normalized = normalizeName(name);
  if (normalized.length === 0 || normalized.length > MAX_GALLERY_SAVED_VIEW_NAME_LENGTH) {
    throw new GallerySavedViewError('invalid', 'Saved Gallery view name is invalid.');
  }
  return normalized;
}

function createUniqueId(views: readonly GallerySavedView[]): string {
  if (typeof crypto.randomUUID !== 'function') {
    throw new GallerySavedViewError('invalid', 'Secure saved view identities are unavailable.');
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const id = crypto.randomUUID();
    if (!views.some((view) => view.id === id)) return id;
  }
  throw new GallerySavedViewError('conflict', 'Could not allocate a saved Gallery view identity.');
}

function hasNameConflict(
  views: readonly GallerySavedView[],
  folder: GallerySavedViewFolder,
  name: string,
  exceptId?: string
): boolean {
  const key = nameKey(name);
  return views.some(
    (view) => view.id !== exceptId && view.folderFilter === folder && nameKey(view.name) === key
  );
}

async function readCurrent(): Promise<GallerySavedView[]> {
  const stored = await browserStorage.local.get([GALLERY_SAVED_VIEWS_STORAGE_KEY]);
  return parsePersisted(stored[GALLERY_SAVED_VIEWS_STORAGE_KEY]);
}

async function writeCurrent(
  views: GallerySavedView[],
  permit: PersistenceMutationPermit
): Promise<void> {
  const payload: PersistedGallerySavedViews = { version: 1, views };
  await browserStorage.local.set({ [GALLERY_SAVED_VIEWS_STORAGE_KEY]: payload }, permit);
}

function mutate<T>(operation: (permit: PersistenceMutationPermit) => Promise<T>): Promise<T> {
  const execute = () => runWithExclusivePersistenceMutationPermit(operation);
  const next = mutationQueue.then(execute, execute);
  mutationQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function listGallerySavedViews(): Promise<GallerySavedView[]> {
  return readCurrent();
}

export function createGallerySavedView(args: {
  filters: GallerySavedViewFilterSnapshot;
  folderFilter: GallerySavedViewFolder;
  name: string;
}): Promise<GallerySavedView> {
  return mutate(async (permit) => {
    const current = await readCurrent();
    if (current.length >= MAX_GALLERY_SAVED_VIEWS) {
      throw new GallerySavedViewError('limit', 'Saved Gallery view limit reached.');
    }
    const name = assertName(args.name);
    if (hasNameConflict(current, args.folderFilter, name)) {
      throw new GallerySavedViewError('conflict', 'A view with this name already exists.');
    }
    const filters = parseFilters(args.filters);
    if (!filters || !FOLDERS.has(args.folderFilter)) {
      throw new GallerySavedViewError('invalid', 'Saved Gallery view is invalid.');
    }
    const now = Date.now();
    const view: GallerySavedView = {
      createdAt: now,
      filters,
      folderFilter: args.folderFilter,
      id: createUniqueId(current),
      name,
      updatedAt: now,
    };
    await writeCurrent([...current, view], permit);
    return structuredClone(view);
  });
}

export function updateGallerySavedView(
  id: string,
  filters: GallerySavedViewFilterSnapshot
): Promise<GallerySavedView> {
  return mutate(async (permit) => {
    const current = await readCurrent();
    const index = current.findIndex((view) => view.id === id);
    if (index < 0) throw new GallerySavedViewError('not-found', 'Saved Gallery view not found.');
    const parsedFilters = parseFilters(filters);
    if (!parsedFilters)
      throw new GallerySavedViewError('invalid', 'Saved Gallery view is invalid.');
    const existing = current[index]!;
    const updated: GallerySavedView = {
      ...existing,
      filters: parsedFilters,
      updatedAt: Date.now(),
    };
    const next = [...current];
    next[index] = updated;
    await writeCurrent(next, permit);
    return structuredClone(updated);
  });
}

export function deleteGallerySavedView(id: string): Promise<void> {
  return mutate(async (permit) => {
    const current = await readCurrent();
    const next = current.filter((view) => view.id !== id);
    if (next.length === current.length) {
      throw new GallerySavedViewError('not-found', 'Saved Gallery view not found.');
    }
    await writeCurrent(next, permit);
  });
}

export function moveGallerySavedView(
  id: string,
  direction: GallerySavedViewMoveDirection
): Promise<GallerySavedView[]> {
  return mutate(async (permit) => {
    const current = await readCurrent();
    const sourceIndex = current.findIndex((view) => view.id === id);
    if (sourceIndex < 0) {
      throw new GallerySavedViewError('not-found', 'Saved Gallery view not found.');
    }
    const source = current[sourceIndex]!;
    const categoryIndexes = current.flatMap((view, index) =>
      view.folderFilter === source.folderFilter ? [index] : []
    );
    const categoryIndex = categoryIndexes.indexOf(sourceIndex);
    const targetIndex = categoryIndexes[categoryIndex + (direction === 'up' ? -1 : 1)];
    if (targetIndex === undefined) return structuredClone(current);
    const next = [...current];
    [next[sourceIndex], next[targetIndex]] = [next[targetIndex]!, next[sourceIndex]!];
    await writeCurrent(next, permit);
    return structuredClone(next);
  });
}

function duplicateName(views: readonly GallerySavedView[], view: GallerySavedView): string {
  const base = view.name;
  for (let suffix = 2; suffix <= MAX_GALLERY_SAVED_VIEWS + 1; suffix += 1) {
    const marker = ` (${suffix})`;
    const candidate = `${base.slice(0, MAX_GALLERY_SAVED_VIEW_NAME_LENGTH - marker.length)}${marker}`;
    if (!hasNameConflict(views, view.folderFilter, candidate)) return candidate;
  }
  throw new GallerySavedViewError('limit', 'Saved Gallery view limit reached.');
}

export function restoreGallerySavedViews(
  importedValue: unknown,
  strategy: ArchiveRestoreStrategy,
  restoreId?: string
): Promise<GallerySavedView[]> {
  const imported = parsePortableGallerySavedViews(importedValue);
  return mutate(async (permit) => {
    let next = await readCurrent();
    if (strategy === 'replace') {
      next = buildGallerySavedViewReplacePlan(next, imported);
      await writeCurrent(next, permit);
      return structuredClone(next);
    }
    for (const [index, candidate] of imported.entries()) {
      const stableDuplicateId = restoreId ? `backup:${restoreId.slice(0, 80)}:${index}` : null;
      if (strategy === 'duplicate' && stableDuplicateId) {
        if (next.some((view) => view.id === stableDuplicateId)) continue;
        if (next.length >= MAX_GALLERY_SAVED_VIEWS) {
          throw new GallerySavedViewError('limit', 'Saved Gallery view limit reached.');
        }
        next = [
          ...next,
          {
            ...candidate,
            id: stableDuplicateId,
            name: hasNameConflict(next, candidate.folderFilter, candidate.name)
              ? duplicateName(next, candidate)
              : candidate.name,
          },
        ];
        continue;
      }

      const idConflictIndex = next.findIndex((view) => view.id === candidate.id);
      const nameConflictIndex = next.findIndex(
        (view) =>
          view.folderFilter === candidate.folderFilter &&
          nameKey(view.name) === nameKey(candidate.name)
      );
      const hasConflict = idConflictIndex >= 0 || nameConflictIndex >= 0;

      if (strategy === 'skip' && hasConflict) continue;
      if (next.length >= MAX_GALLERY_SAVED_VIEWS) {
        throw new GallerySavedViewError('limit', 'Saved Gallery view limit reached.');
      }
      next = [
        ...next,
        strategy === 'duplicate' && hasConflict
          ? { ...candidate, id: createUniqueId(next), name: duplicateName(next, candidate) }
          : candidate,
      ];
    }
    await writeCurrent(next, permit);
    return structuredClone(next);
  });
}
