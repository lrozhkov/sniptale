import {
  getMediaAssetBlob,
  getMediaLibraryEntry,
} from '../../../composition/persistence/media-library/index.library.ts';
import {
  consumePendingEditorBootstrapPayload,
  type EditorBootstrapPayload,
} from '../../../workflows/editor/bootstrap';
import { EDITOR_BOOTSTRAP_QUERY_PARAM } from '../../../features/editor/contracts/bootstrap';
import { readEditorAssetId, readEditorSessionId } from '@sniptale/runtime-contracts/editor/session';
import { createSecureRandomUuid as createEditorSessionId } from '@sniptale/platform/security/secure-random-id';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import { type EditorSessionAutosaveService } from '../session-autosave';

interface EditorPageLocationState {
  assetId: string | null;
  bootstrapId: string | null;
  sessionId: string | null;
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

function buildCurrentEditorSessionUrl(sessionId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('session', sessionId);
  return `${url.pathname}${url.search}`;
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
    sessionId: readEditorSessionId(search),
  };
}

/**
 * Ensures the current editor tab has a stable logical session id in its URL.
 */
export function ensureEditorPageSessionId(locationState: EditorPageLocationState): string {
  if (locationState.sessionId) {
    return locationState.sessionId;
  }

  const sessionId = createEditorSessionId();
  window.history.replaceState({}, '', buildCurrentEditorSessionUrl(sessionId));
  return sessionId;
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
  sessionId: string,
  autosaveService: Pick<EditorSessionAutosaveService, 'restoreDraft'>
): Promise<EditorPageRestoreSource> {
  const draftEntry = await autosaveService.restoreDraft(sessionId);
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
