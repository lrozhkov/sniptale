import { createLogger } from '@sniptale/platform/observability/logger';
import { hydratePersistedEditorDocument } from '../document-assets';
import {
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  IMAGE_WORKSPACE_IDENTITIES_STORE,
  IMAGE_WORKSPACES_STORE,
  initDB,
} from '../infrastructure/indexed-db/core';
import type { ImageWorkspaceEntry, StoredImageWorkspaceEntry } from './contracts';
import { parseImageWorkspaceEntry } from './parser';
import { imageWorkspaceAssetBindings } from './assets';
import { hydratePersistedImageHistory } from './history-codec';
import { readImageWorkspaceIdentity } from './identity';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseProjectAssetEntry } from '../projects/read-guards';
import { parseAssetRef } from '../assets/guards';
import { readAssetFile, MissingAssetObjectError } from '../assets';
import type { MediaLibraryEntry } from '../media-library/contracts';

const logger = createLogger({ namespace: 'ImageWorkspacesDb' });

async function hydrateWorkspace(
  entry: StoredImageWorkspaceEntry,
  observedRefs?: unknown[],
  sourceGeneration?: string | null,
  includeHistory = true
): Promise<ImageWorkspaceEntry> {
  const db = await initDB();
  const refs =
    observedRefs ??
    (await Promise.all(
      [...new Set(imageWorkspaceAssetBindings(entry).map((asset) => asset.assetId))].map((id) =>
        db.get(ASSET_REFS_STORE, id)
      )
    ));
  const hydrated = await hydratePersistedEditorDocument({ document: entry.document, refs });
  const { history: storedHistory, publicationId: _publicationId, ...workspace } = entry;
  const history =
    includeHistory && storedHistory
      ? await hydratePersistedImageHistory({ history: storedHistory, refs }).catch(
          (error: unknown) => {
            hydrated.release();
            throw error;
          }
        )
      : undefined;
  return {
    ...workspace,
    ...(sourceGeneration === undefined ? {} : { sourceGeneration }),
    document: hydrated.document,
    ...(history
      ? { history: history.checkpoint, historyAssetsByValue: history.assetsByValue }
      : {}),
    documentAssetsByVectorDefinitionId: hydrated.assetsByVectorDefinitionId,
    documentAssetsByRuntimeUrl: hydrated.assetsByRuntimeUrl,
    releaseDocumentAssets: hydrated.release,
  };
}

export async function readStoredImageWorkspace(
  aggregateId: string
): Promise<StoredImageWorkspaceEntry | undefined> {
  const db = await initDB();
  const raw: unknown = await db.get(IMAGE_WORKSPACES_STORE, aggregateId);
  const entry = parseImageWorkspaceEntry(raw);
  if (!entry && raw !== undefined) {
    logger.warn('Ignoring invalid image workspace entry', { aggregateId });
  }
  return entry ?? undefined;
}

export async function readImageWorkspace(
  aggregateId: string,
  options: { includeHistory?: boolean } = {}
): Promise<ImageWorkspaceEntry | undefined> {
  const db = await initDB();
  const tx = db.transaction(
    [IMAGE_WORKSPACES_STORE, IMAGE_WORKSPACE_IDENTITIES_STORE, ASSET_REFS_STORE],
    'readonly'
  );
  const workspaceRead: Promise<unknown> = tx.objectStore(IMAGE_WORKSPACES_STORE).get(aggregateId);
  const [raw, identity] = await Promise.all([
    workspaceRead,
    readImageWorkspaceIdentity(tx, aggregateId),
  ]);
  const entry = parseImageWorkspaceEntry(raw);
  const includeHistory = options.includeHistory !== false;
  const refs = entry
    ? await Promise.all(
        [
          ...new Set(
            (includeHistory ? imageWorkspaceAssetBindings(entry) : entry.document.assets).map(
              (asset) => asset.assetId
            )
          ),
        ].map((id) => tx.objectStore(ASSET_REFS_STORE).get(id))
      )
    : [];
  await tx.done;
  if (!entry) {
    if (raw !== undefined) logger.warn('Ignoring invalid image workspace entry', { aggregateId });
    return undefined;
  }
  if (identity?.retired) throw new Error('Image workspace lifetime has ended.');
  return hydrateWorkspace(entry, refs, identity?.generation ?? null, includeHistory);
}

/** Observe the original and its lifetime before asynchronous byte reads can cross a restore. */
export async function readImageOriginalSource(
  aggregateId: string,
  options: { includeBlob?: boolean } = {}
): Promise<{
  asset: MediaLibraryEntry | undefined;
  blob: Blob | undefined;
  sourceGeneration: string | null;
}> {
  const db = await initDB();
  const tx = db.transaction(
    [MEDIA_LIBRARY_STORE, IMAGE_WORKSPACE_IDENTITIES_STORE, PROJECT_ASSETS_STORE, ASSET_REFS_STORE],
    'readonly'
  );
  const mediaRead: Promise<unknown> = tx.objectStore(MEDIA_LIBRARY_STORE).get(aggregateId);
  const [raw, identity] = await Promise.all([
    mediaRead,
    readImageWorkspaceIdentity(tx, aggregateId),
  ]);
  const asset = parseMediaLibraryEntry(raw) ?? undefined;
  let assetId: string | undefined;
  if (asset?.source.kind === 'stored-asset') assetId = asset.source.assetId;
  if (asset?.source.kind === 'project-asset') {
    const child = parseProjectAssetEntry(
      await tx.objectStore(PROJECT_ASSETS_STORE).get(asset.source.projectAssetId)
    );
    assetId = child?.assetId;
  }
  const ref = assetId ? parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(assetId)) : null;
  await tx.done;
  if (raw !== undefined && !asset) throw new Error('Image original metadata is invalid.');
  if (asset && identity?.retired) throw new Error('Image workspace lifetime has ended.');
  const sourceGeneration = identity?.generation ?? null;
  if (options.includeBlob === false) return { asset, sourceGeneration, blob: undefined };
  return {
    asset,
    sourceGeneration,
    blob:
      asset?.source.kind === 'screenshot'
        ? asset.blob
        : ref && asset
          ? await readAssetFile(ref, asset.filename).catch((error: unknown) => {
              if (error instanceof Error && error.name === 'NotFoundError')
                throw new MissingAssetObjectError(ref.assetId);
              throw error;
            })
          : undefined,
  };
}

export async function readStoredImageWorkspaces(): Promise<StoredImageWorkspaceEntry[]> {
  const db = await initDB();
  return (await db.getAll(IMAGE_WORKSPACES_STORE))
    .map(parseImageWorkspaceEntry)
    .filter((entry): entry is StoredImageWorkspaceEntry => entry !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function hydrateImageWorkspaces(
  entries: StoredImageWorkspaceEntry[]
): Promise<ImageWorkspaceEntry[]> {
  return Promise.all(entries.map((entry) => hydrateWorkspace(entry)));
}
