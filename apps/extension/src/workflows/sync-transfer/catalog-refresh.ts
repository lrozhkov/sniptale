import {
  loadSyncCatalogCache,
  replaceSyncCatalogCache,
} from '../../composition/persistence/sync-catalog/catalog-cache';
import { scanSyncCatalogSnapshot } from './catalog';
import type { SyncRemoteStore } from './remote-store';

/**
 * Refresh through a full listing, with advisory raw-manifest reuse for the selected profile.
 * Normal hits assume immutable keys: a same-key, same-size external rewrite needs bypassCache
 * to be observed. Cache reuse supplies no integrity, publication or source-release authority.
 */
export async function refreshPersistedSyncCatalog(
  remote: SyncRemoteStore,
  spaceId: string,
  connectionGeneration: number,
  signal: AbortSignal,
  options: { bypassCache?: boolean } = {}
) {
  const bypassCache = options.bypassCache === true;
  signal.throwIfAborted();
  const cached = await loadSyncCatalogCache(spaceId, connectionGeneration).catch(() => null);
  signal.throwIfAborted();
  const result = await scanSyncCatalogSnapshot(
    remote,
    spaceId,
    signal,
    bypassCache ? [] : (cached?.manifests ?? [])
  );
  signal.throwIfAborted();
  if (cached) {
    await replaceSyncCatalogCache(
      spaceId,
      connectionGeneration,
      cached.profileCreatedAt,
      result.manifests
    ).catch(() => false);
  }
  signal.throwIfAborted();
  return result.catalog;
}
