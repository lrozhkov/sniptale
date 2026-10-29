import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { initDB } from '../infrastructure/indexed-db/core';
import {
  SYNC_CAPTURE_STORE,
  SYNC_CATALOG_CACHE_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseSyncCaptureRecord } from '../sync-capture/guards';

const ACTIVE_KEY = 'active';
const MAX_MANIFESTS = 10_000;
const MAX_ITEM_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;

/** Exact remote text only. Consumers must check the content hash and domain on every reuse. */
export interface CachedSyncManifest {
  manifestKey: string;
  size: number;
  text: string;
}

interface CatalogCacheSnapshot {
  version: 1;
  key: 'active';
  spaceId: string;
  connectionGeneration: number;
  profileCreatedAt: number;
  manifests: CachedSyncManifest[];
}

class InvalidNativeProfile extends Error {}

function ordinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validScope(spaceId: unknown, generation: unknown): spaceId is string {
  return (
    typeof spaceId === 'string' &&
    spaceId.length > 0 &&
    spaceId.length <= 256 &&
    ordinal(generation) &&
    generation > 0
  );
}

function relativeKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 2048 &&
    !/[\\?#:]/u.test(value) &&
    ![...value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    ) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function parseManifests(value: unknown): CachedSyncManifest[] | null {
  if (!Array.isArray(value) || value.length > MAX_MANIFESTS) return null;
  const entries: unknown[] = value;
  const manifests: CachedSyncManifest[] = [];
  const keys = new Set<string>();
  const encoder = new TextEncoder();
  let total = 0;
  for (const item of entries) {
    if (
      !isRecord(item) ||
      Object.keys(item).length !== 3 ||
      !relativeKey(item['manifestKey']) ||
      !ordinal(item['size']) ||
      item['size'] > MAX_ITEM_BYTES ||
      typeof item['text'] !== 'string' ||
      item['text'].length > MAX_ITEM_BYTES ||
      keys.has(item['manifestKey'])
    )
      return null;
    const size = encoder.encode(item['text']).byteLength;
    total += size + encoder.encode(item['manifestKey']).byteLength;
    if (size !== item['size'] || size > MAX_ITEM_BYTES || total > MAX_TOTAL_BYTES) return null;
    keys.add(item['manifestKey']);
    manifests.push({ manifestKey: item['manifestKey'], size, text: item['text'] });
  }
  return manifests;
}

function parseSnapshot(value: unknown): CatalogCacheSnapshot | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 6 ||
    value['version'] !== 1 ||
    value['key'] !== ACTIVE_KEY ||
    !validScope(value['spaceId'], value['connectionGeneration']) ||
    !ordinal(value['connectionGeneration']) ||
    !ordinal(value['profileCreatedAt'])
  )
    return null;
  const manifests = parseManifests(value['manifests']);
  if (!manifests) return null;
  return {
    version: 1,
    key: ACTIVE_KEY,
    spaceId: value['spaceId'],
    connectionGeneration: value['connectionGeneration'],
    profileCreatedAt: value['profileCreatedAt'],
    manifests,
  };
}

function matchingProfile(raw: unknown, spaceId: string, connectionGeneration: number) {
  if (raw === undefined) return null;
  const profile = parseSyncCaptureRecord(raw);
  if (!profile || profile.kind !== 'profile')
    throw new InvalidNativeProfile('Invalid sync capture profile.');
  return profile.enabled &&
    profile.spaceId === spaceId &&
    profile.connectionGeneration === connectionGeneration
    ? profile
    : null;
}

/** Read without repair. Cache refusal is advisory; malformed native authority still fails. */
export async function loadSyncCatalogCache(
  spaceId: string,
  connectionGeneration: number
): Promise<{ profileCreatedAt: number; manifests: CachedSyncManifest[] } | null> {
  if (!validScope(spaceId, connectionGeneration)) return null;
  let rawProfile: unknown;
  let rawCache: unknown;
  try {
    const db = await initDB();
    const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_CATALOG_CACHE_STORE], 'readonly');
    rawProfile = await tx.objectStore(SYNC_CAPTURE_STORE).get('profile');
    rawCache = await tx.objectStore(SYNC_CATALOG_CACHE_STORE).get(ACTIVE_KEY);
    await tx.done;
  } catch {
    return null;
  }
  const profile = matchingProfile(rawProfile, spaceId, connectionGeneration);
  if (!profile) return null;
  const cache = parseSnapshot(rawCache);
  return {
    profileCreatedAt: profile.createdAt,
    manifests:
      cache &&
      cache.spaceId === spaceId &&
      cache.connectionGeneration === connectionGeneration &&
      cache.profileCreatedAt === profile.createdAt
        ? cache.manifests
        : [],
  };
}

/** Atomically replace one bounded advisory snapshot after checking the current native profile. */
export async function replaceSyncCatalogCache(
  spaceId: string,
  connectionGeneration: number,
  profileCreatedAt: number,
  manifests: readonly CachedSyncManifest[]
): Promise<boolean> {
  if (!validScope(spaceId, connectionGeneration) || !ordinal(profileCreatedAt)) return false;
  // Parsing copies each admitted primitive before the first await; caller mutation cannot leak in.
  const detached = parseManifests(manifests);
  if (!detached) return false;
  const proposed: CatalogCacheSnapshot = {
    version: 1,
    key: ACTIVE_KEY,
    spaceId,
    connectionGeneration,
    profileCreatedAt,
    manifests: detached,
  };
  try {
    return await runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_CATALOG_CACHE_STORE], 'readwrite');
      try {
        const profile = matchingProfile(
          await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'),
          spaceId,
          connectionGeneration
        );
        if (!profile || profile.createdAt !== profileCreatedAt) {
          await tx.done;
          return false;
        }
        const store = tx.objectStore(SYNC_CATALOG_CACHE_STORE);
        await store.clear();
        await store.put(proposed);
        await tx.done;
        return true;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* The transaction can already be closed. */
        }
        await tx.done.catch(() => undefined);
        throw error;
      }
    });
  } catch (error) {
    if (error instanceof InvalidNativeProfile) throw error;
    return false;
  }
}
