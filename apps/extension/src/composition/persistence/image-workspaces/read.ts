import { createLogger } from '@sniptale/platform/observability/logger';
import { hydratePersistedEditorDocument } from '../document-assets';
import {
  ASSET_REFS_STORE,
  IMAGE_WORKSPACES_STORE,
  initDB,
} from '../infrastructure/indexed-db/core';
import type { ImageWorkspaceEntry, StoredImageWorkspaceEntry } from './contracts';
import { parseImageWorkspaceEntry } from './parser';

const logger = createLogger({ namespace: 'ImageWorkspacesDb' });

async function hydrateWorkspace(entry: StoredImageWorkspaceEntry): Promise<ImageWorkspaceEntry> {
  const db = await initDB();
  const refs = await Promise.all(
    entry.document.assets.map((asset) => db.get(ASSET_REFS_STORE, asset.assetId))
  );
  const hydrated = await hydratePersistedEditorDocument({ document: entry.document, refs });
  return {
    ...entry,
    document: hydrated.document,
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
  aggregateId: string
): Promise<ImageWorkspaceEntry | undefined> {
  const entry = await readStoredImageWorkspace(aggregateId);
  return entry ? hydrateWorkspace(entry) : undefined;
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
  return Promise.all(entries.map(hydrateWorkspace));
}
