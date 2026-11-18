import { legacyImageProjectId } from '../../../composition/persistence/media-library/legacy-projects';
import {
  readImageOriginalSource,
  recoverAndGetStoredImageWorkspace,
} from '../../../composition/persistence/image-workspaces';
import { readImageWorkspace } from '../../../composition/persistence/image-workspaces/read';
import { ensureNativeEditingRootAvailable } from '../../../workflows/sync-transfer/editing-admission';
import { getMediaLibraryEntry } from '../../../composition/persistence/media-library/index.library.ts';
import {
  consumePendingEditorBootstrapPayload,
  type EditorBootstrapPayload,
} from '../../../workflows/editor/bootstrap';
import { EDITOR_BOOTSTRAP_QUERY_PARAM } from '../../../features/editor/contracts/bootstrap';
import { buildEditorUrl } from '../../../platform/navigation/extension-pages/editor';
import { readEditorAssetId } from '@sniptale/runtime-contracts/editor/session';
import { createSecureRandomUuid as createAggregateId } from '@sniptale/platform/security/secure-random-id';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import { MissingAssetObjectError } from '../../../composition/persistence/assets';
import { MissingEditorDocumentAssetError } from '../../../composition/persistence/document-assets';
import { type EditorSessionAutosaveService } from '../session-autosave';

interface EditorPageLocationState {
  assetId: string | null;
  bootstrapId: string | null;
  originalId?: string;
}

interface EditorPageAssetRestoreSource {
  kind: 'asset';
  assetId: string;
  nativeRevision: number;
  sourceGeneration: string | null;
  original?: { mediaId: string; generation: string | null };
  dataUrl: string;
  filename: string | null;
  sourceFaviconUrl: string | null;
  sourceTitle: string;
  sourceUrl: string;
  capturedAt: number | null;
}

interface EditorPageBootstrapRestoreSource {
  kind: 'bootstrap';
  payload: EditorBootstrapPayload;
  capturedAt: number | null;
}

interface EditorPageDraftRestoreSource {
  kind: 'draft';
  entry: NonNullable<Awaited<ReturnType<EditorSessionAutosaveService['restoreDraft']>>>;
  capturedAt: number | null;
}

interface EditorPageEmptyRestoreSource {
  kind: 'empty';
}

type EditorPageRestoreSource =
  | EditorPageAssetRestoreSource
  | EditorPageBootstrapRestoreSource
  | EditorPageDraftRestoreSource
  | EditorPageEmptyRestoreSource;

export class MissingEditorOriginalError extends Error {
  override name = 'MissingEditorOriginalError';

  constructor() {
    super('The original image file is missing from local storage.');
  }
}

export interface EditorImageRecovery {
  routeAssetId: string;
  aggregateId: string;
  sourceMediaId?: string;
  revision: number;
  generation: string | null;
}

export class MissingEditorDraftAssetError extends Error {
  override name = 'MissingEditorDraftAssetError';

  constructor(readonly recovery?: EditorImageRecovery) {
    super('A stored editor document file is missing from local storage.');
  }
}

function readEditorBootstrapId(search: string): string | null {
  return new URLSearchParams(search).get(EDITOR_BOOTSTRAP_QUERY_PARAM);
}

function buildCurrentEditorAggregateUrl(aggregateId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('assetId', aggregateId);
  url.searchParams.delete('originalId');
  url.searchParams.delete('session');
  return `${url.pathname}${url.search}`;
}

/** Rebinds the current editor tab to a newly created aggregate without reloading the document. */
export function replaceEditorPageAggregateId(aggregateId: string): void {
  window.history.replaceState({}, '', buildCurrentEditorAggregateUrl(aggregateId));
}

/** Updates a successfully loaded library image URL and returns its transaction rollback. */
export function replaceEditorPageImageLocation(aggregateId: string): () => void {
  const previousUrl = window.location.href;
  const previousState: unknown = window.history.state;
  const nextUrl = buildEditorUrl({ assetId: aggregateId });
  window.history.replaceState({}, '', nextUrl);
  return () => {
    if (window.location.href === nextUrl)
      window.history.replaceState(previousState, '', previousUrl);
  };
}

/** Starts a fresh standalone draft for a local image opened in the current editor tab. */
export function beginEditorPageLocalDraft(args: {
  autosaveService: Pick<EditorSessionAutosaveService, 'activate'>;
  renderPresentation: (signal?: AbortSignal) => Promise<string> | string;
  sourceTitle: string;
}): string {
  const aggregateId = createAggregateId();
  const url = new URL(window.location.href);
  url.searchParams.set('assetId', aggregateId);
  url.searchParams.delete('originalId');
  url.searchParams.delete(EDITOR_BOOTSTRAP_QUERY_PARAM);
  url.searchParams.delete('session');
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  args.autosaveService.activate({
    aggregateId,
    durableRevision: 0,
    renderPresentation: args.renderPresentation,
    sourceTitle: args.sourceTitle,
    sourceUrl: '',
  });
  return aggregateId;
}

/** Ends the current page session without deleting its library asset or persisted workspace. */
export function clearEditorPageSession(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('assetId');
  url.searchParams.delete('originalId');
  url.searchParams.delete(EDITOR_BOOTSTRAP_QUERY_PARAM);
  url.searchParams.delete('session');
  window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

/**
 * Reads the current editor location params that affect session restore semantics.
 */
export function readEditorPageLocationState(
  search = window.location.search
): EditorPageLocationState {
  const assetId = readEditorAssetId(search);
  const originalId = new URLSearchParams(search).get('originalId');
  return {
    assetId,
    bootstrapId: readEditorBootstrapId(search),
    ...(assetId && originalId && originalId !== assetId && originalId.length <= 256
      ? { originalId }
      : {}),
  };
}

/**
 * Ensures the current editor tab has a stable logical session id in its URL.
 */
export function ensureEditorPageAggregateId(locationState: EditorPageLocationState): string {
  if (locationState.assetId) {
    return locationState.assetId;
  }

  const aggregateId = createAggregateId();
  replaceEditorPageAggregateId(aggregateId);
  return aggregateId;
}

async function resolveEditorAssetSource(assetId: string): Promise<EditorPageRestoreSource> {
  const { blob, asset, sourceGeneration } = await readImageOriginalSource(assetId).catch(
    (error: unknown) => {
      if (error instanceof MissingAssetObjectError) {
        throw new MissingEditorOriginalError();
      }
      throw error;
    }
  );

  if (!blob) {
    if (asset) throw new MissingEditorOriginalError();
    return { kind: 'empty' };
  }

  return {
    kind: 'asset',
    assetId,
    nativeRevision: asset?.workspaceRevision ?? 0,
    sourceGeneration,
    dataUrl: await blobToDataUrl(blob),
    filename: asset?.filename ?? null,
    sourceFaviconUrl: asset?.sourceFavicon ?? null,
    sourceTitle: asset?.sourceTitle ?? asset?.filename ?? '',
    sourceUrl: asset?.sourceUrl ?? '',
    capturedAt: asset?.createdAt ?? null,
  };
}

async function resolveOriginalCaptureTime(
  aggregateId: string,
  fallback: number | null
): Promise<number | null> {
  try {
    const asset = await getMediaLibraryEntry(aggregateId);
    return asset?.createdAt ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Resolves the best available restore source for the current editor session.
 */
export async function resolveEditorPageRestoreSource(
  locationState: EditorPageLocationState,
  aggregateId: string,
  autosaveService: Pick<EditorSessionAutosaveService, 'restoreDraft'>,
  isCurrent?: () => boolean
): Promise<EditorPageRestoreSource> {
  const mediaId = locationState.originalId ?? locationState.assetId;
  let targetId = aggregateId;
  if (mediaId === aggregateId && !locationState.originalId) {
    const migratedId = legacyImageProjectId(aggregateId);
    const migrated = await recoverAndGetStoredImageWorkspace(migratedId);
    if (migrated?.aggregateId === migratedId && migrated.sourceMediaId === aggregateId)
      targetId = migratedId;
  }
  let draftEntry: Awaited<ReturnType<EditorSessionAutosaveService['restoreDraft']>>;
  let recovery: EditorImageRecovery | undefined;
  try {
    if (locationState.assetId && !locationState.originalId) {
      const observed = await readImageOriginalSource(targetId, { includeBlob: false });
      if (observed.asset?.id === targetId)
        recovery = {
          routeAssetId: locationState.assetId,
          aggregateId: targetId,
          revision: observed.asset.workspaceRevision ?? 0,
          generation: observed.sourceGeneration,
          ...(observed.sourceMediaId ? { sourceMediaId: observed.sourceMediaId } : {}),
        };
    }
    if (targetId !== aggregateId) {
      try {
        await ensureNativeEditingRootAvailable({ rootKind: 'image-project', rootId: targetId });
      } catch (error) {
        // Check the local document so a failed cache request alone does not classify it as damaged.
        const local = await readImageWorkspace(targetId);
        local?.releaseDocumentAssets?.();
        throw error;
      }
    } else if (mediaId) {
      await ensureNativeEditingRootAvailable({ rootKind: 'media', rootId: mediaId });
    }
    draftEntry = await autosaveService.restoreDraft(targetId, isCurrent);
  } catch (error) {
    if (
      error instanceof MissingAssetObjectError ||
      error instanceof MissingEditorDocumentAssetError ||
      (error instanceof Error && error.name === 'NotFoundError')
    )
      throw new MissingEditorDraftAssetError(recovery);
    throw error;
  }
  if (
    targetId !== aggregateId &&
    (draftEntry?.aggregateId !== targetId || draftEntry.sourceMediaId !== aggregateId)
  )
    throw new MissingEditorDraftAssetError(recovery);
  if (draftEntry) {
    return {
      kind: 'draft',
      entry: draftEntry,
      capturedAt: await resolveOriginalCaptureTime(
        draftEntry.sourceMediaId ?? aggregateId,
        draftEntry.createdAt ?? null
      ),
    };
  }

  if (locationState.originalId && locationState.assetId === aggregateId) {
    const resolved = await resolveEditorAssetSource(locationState.originalId);
    if (resolved.kind !== 'asset') throw new MissingEditorOriginalError();
    return {
      ...resolved,
      assetId: aggregateId,
      original: { mediaId: locationState.originalId, generation: resolved.sourceGeneration },
      nativeRevision: 0,
      sourceGeneration: null,
    };
  }

  const bootstrapPayload = await consumePendingEditorBootstrapPayload(locationState.bootstrapId);
  // A transport payload cannot replace the observed lifetime or original of a stored asset.
  if (locationState.assetId) return resolveEditorAssetSource(locationState.assetId);
  if (bootstrapPayload) {
    return {
      kind: 'bootstrap',
      payload: bootstrapPayload,
      capturedAt: await resolveOriginalCaptureTime(
        aggregateId,
        bootstrapPayload.capturedAt ?? null
      ),
    };
  }

  return { kind: 'empty' };
}
