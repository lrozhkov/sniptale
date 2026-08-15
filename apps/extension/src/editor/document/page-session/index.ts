import {
  getMediaAssetBlob,
  getMediaLibraryEntry,
} from '../../../composition/persistence/media-library/index.library.ts';
import {
  consumePendingEditorBootstrapPayload,
  type EditorBootstrapPayload,
} from '../../../workflows/editor/bootstrap';
import { EDITOR_BOOTSTRAP_QUERY_PARAM } from '../../../features/editor/contracts/bootstrap';
import { readEditorAssetId } from '@sniptale/runtime-contracts/editor/session';
import { createSecureRandomUuid as createAggregateId } from '@sniptale/platform/security/secure-random-id';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import { type EditorSessionAutosaveService } from '../session-autosave';

interface EditorPageLocationState {
  assetId: string | null;
  bootstrapId: string | null;
}

interface EditorPageAssetRestoreSource {
  kind: 'asset';
  assetId: string;
  dataUrl: string;
  filename: string | null;
  sourceFaviconUrl: string | null;
  sourceTitle: string;
  sourceUrl: string;
}

interface EditorPageBootstrapRestoreSource {
  kind: 'bootstrap';
  payload: EditorBootstrapPayload;
}

interface EditorPageDraftRestoreSource {
  kind: 'draft';
  entry: NonNullable<Awaited<ReturnType<EditorSessionAutosaveService['restoreDraft']>>>;
}

interface EditorPageEmptyRestoreSource {
  kind: 'empty';
}

type EditorPageRestoreSource =
  | EditorPageAssetRestoreSource
  | EditorPageBootstrapRestoreSource
  | EditorPageDraftRestoreSource
  | EditorPageEmptyRestoreSource;

function readEditorBootstrapId(search: string): string | null {
  return new URLSearchParams(search).get(EDITOR_BOOTSTRAP_QUERY_PARAM);
}

function buildCurrentEditorAggregateUrl(aggregateId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('assetId', aggregateId);
  url.searchParams.delete('session');
  return `${url.pathname}${url.search}`;
}

/** Rebinds the current editor tab to a newly created aggregate without reloading the document. */
export function replaceEditorPageAggregateId(aggregateId: string): void {
  window.history.replaceState({}, '', buildCurrentEditorAggregateUrl(aggregateId));
}

/** Starts a fresh standalone draft for a local image opened in the current editor tab. */
export function beginEditorPageLocalDraft(args: {
  autosaveService: Pick<EditorSessionAutosaveService, 'activate'>;
  renderPresentation: () => Promise<string> | string;
  sourceTitle: string;
}): string {
  const aggregateId = createAggregateId();
  const url = new URL(window.location.href);
  url.searchParams.set('assetId', aggregateId);
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
  return {
    assetId: readEditorAssetId(search),
    bootstrapId: readEditorBootstrapId(search),
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
  const [blob, asset] = await Promise.all([
    getMediaAssetBlob(assetId),
    getMediaLibraryEntry(assetId),
  ]);

  if (!blob) {
    return { kind: 'empty' };
  }

  return {
    kind: 'asset',
    assetId,
    dataUrl: await blobToDataUrl(blob),
    filename: asset?.filename ?? null,
    sourceFaviconUrl: asset?.sourceFavicon ?? null,
    sourceTitle: asset?.sourceTitle ?? asset?.filename ?? '',
    sourceUrl: asset?.sourceUrl ?? '',
  };
}

/**
 * Resolves the best available restore source for the current editor session.
 */
export async function resolveEditorPageRestoreSource(
  locationState: EditorPageLocationState,
  aggregateId: string,
  autosaveService: Pick<EditorSessionAutosaveService, 'restoreDraft'>
): Promise<EditorPageRestoreSource> {
  const draftEntry = await autosaveService.restoreDraft(aggregateId);
  if (draftEntry) {
    return {
      kind: 'draft',
      entry: draftEntry,
    };
  }

  const bootstrapPayload = await consumePendingEditorBootstrapPayload(locationState.bootstrapId);
  if (bootstrapPayload) {
    return {
      kind: 'bootstrap',
      payload: bootstrapPayload,
    };
  }

  if (locationState.assetId) {
    return resolveEditorAssetSource(locationState.assetId);
  }

  return { kind: 'empty' };
}
