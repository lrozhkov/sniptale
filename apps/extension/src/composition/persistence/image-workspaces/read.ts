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
import type { LibraryLifecycle } from '../library-lifecycle/contracts';
import {
  ROW_REFERENCE_INDEX,
  rowReferenceKey,
} from '../infrastructure/indexed-db/row-index-contract';

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
  if (identity?.retired || entry.lifecycle?.trashedAt !== undefined)
    throw new Error('Image workspace is unavailable.');
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
    [
      MEDIA_LIBRARY_STORE,
      IMAGE_WORKSPACES_STORE,
      IMAGE_WORKSPACE_IDENTITIES_STORE,
      PROJECT_ASSETS_STORE,
      ASSET_REFS_STORE,
    ],
    'readonly'
  );
  const mediaRead: Promise<unknown> = tx.objectStore(MEDIA_LIBRARY_STORE).get(aggregateId);
  const [raw, identity] = await Promise.all([
    mediaRead,
    readImageWorkspaceIdentity(tx, aggregateId),
  ]);
  const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
  const projectRow: unknown =
    raw === undefined ? await tx.objectStore(IMAGE_WORKSPACES_STORE).get(aggregateId) : undefined;
  const project = parseImageWorkspaceEntry(projectRow);
  if (projectRow !== undefined && (!project || project.aggregateId !== aggregateId))
    throw new Error('Image project metadata is invalid.');
  if (project?.lifecycle?.trashedAt !== undefined) throw new Error('Image workspace is in Trash.');
  const sourceMediaId = project?.sourceMediaId;
  const original = parseMediaLibraryEntry(
    sourceMediaId === undefined ? raw : await mediaStore.get(sourceMediaId)
  );
  if (
    sourceMediaId !== undefined &&
    (!original ||
      original.id !== sourceMediaId ||
      (original.kind !== 'screenshot' && original.kind !== 'image'))
  )
    throw new MissingAssetObjectError(sourceMediaId);
  const asset =
    project && original && sourceMediaId !== undefined
      ? {
          ...original,
          id: project.aggregateId,
          workspaceRevision: project.revision,
          imageContentState: 'edited' as const,
        }
      : (original ?? undefined);
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

export interface ImageWorkspaceProjectSummary {
  aggregateId: string;
  sourceMediaId: string;
  name: string | null;
  lifecycle: LibraryLifecycle;
  createdAt: number;
  updatedAt: number;
  revision: number;
  width: number;
  height: number;
}

export async function listImageWorkspaceProjectSummaries(): Promise<
  ImageWorkspaceProjectSummary[]
> {
  return (await readStoredImageWorkspaces()).flatMap((workspace) => {
    const { aggregateId, sourceMediaId, lifecycle, createdAt, updatedAt, revision, document } =
      workspace;
    if (sourceMediaId === undefined || lifecycle === undefined) return [];
    return [
      {
        aggregateId,
        sourceMediaId,
        name: document.displayName?.trim() || null,
        lifecycle,
        createdAt,
        updatedAt,
        revision,
        width: document.canvasWidth,
        height: document.canvasHeight,
      },
    ];
  });
}

/** Read only projects bound to the selected original, with no hydration or publication. */
export async function listImageProjectsForEditing(
  mediaId: string
): Promise<{ id: string; name: string; updatedAt: number }[]> {
  const db = await initDB();
  const tx = db.transaction([MEDIA_LIBRARY_STORE, IMAGE_WORKSPACES_STORE], 'readonly');
  const store = tx.objectStore(IMAGE_WORKSPACES_STORE);
  const originalRead: Promise<unknown> = tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId);
  const projectsRead: Promise<unknown[]> = store
    .index(ROW_REFERENCE_INDEX)
    .getAll(rowReferenceKey('media', mediaId));
  const legacyRead: Promise<unknown> = store.get(mediaId);
  const [raw, rows, legacy] = await Promise.all([originalRead, projectsRead, legacyRead]);
  await tx.done;
  const original = parseMediaLibraryEntry(raw);
  if (
    !original ||
    original.id !== mediaId ||
    original.lifecycle?.trashedAt !== undefined ||
    (original.kind !== 'screenshot' && original.kind !== 'image')
  )
    throw new MissingAssetObjectError(mediaId);

  const projects = rows
    .map(parseImageWorkspaceEntry)
    .filter(
      (workspace): workspace is StoredImageWorkspaceEntry =>
        workspace !== null &&
        workspace.sourceMediaId === mediaId &&
        workspace.lifecycle?.trashedAt === undefined
    )
    .map((workspace) => ({
      id: workspace.aggregateId,
      name: workspace.document.displayName?.trim() || original.filename,
      updatedAt: workspace.updatedAt,
    }));
  const previous = parseImageWorkspaceEntry(legacy);
  if (previous?.aggregateId === mediaId && original.imageContentState === 'edited') {
    projects.push({
      id: mediaId,
      name: previous.document.displayName?.trim() || original.filename,
      updatedAt: previous.updatedAt,
    });
  }
  return projects.sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function hydrateImageWorkspaces(
  entries: StoredImageWorkspaceEntry[]
): Promise<ImageWorkspaceEntry[]> {
  return Promise.all(entries.map((entry) => hydrateWorkspace(entry)));
}
