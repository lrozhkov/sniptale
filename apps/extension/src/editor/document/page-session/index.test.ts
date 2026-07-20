// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from './document.test-support';

const {
  consumePendingEditorBootstrapPayloadMock,
  createEditorSessionIdMock,
  getMediaAssetBlobMock,
  getMediaLibraryEntryMock,
  readEditorAssetIdMock,
  readEditorSessionIdMock,
  restoreEditorSessionDraftMock,
  blobToDataUrlMock,
} = vi.hoisted(() => ({
  consumePendingEditorBootstrapPayloadMock: vi.fn(),
  createEditorSessionIdMock: vi.fn(),
  getMediaAssetBlobMock: vi.fn(),
  getMediaLibraryEntryMock: vi.fn(),
  readEditorAssetIdMock: vi.fn(),
  readEditorSessionIdMock: vi.fn(),
  restoreEditorSessionDraftMock: vi.fn(),
  blobToDataUrlMock: vi.fn(),
}));

const autosaveService = {
  restoreDraft: restoreEditorSessionDraftMock,
};

const ASSET_RESTORE_LOCATION = {
  assetId: 'asset-3',
  bootstrapId: null,
  sessionId: 'session-3',
} as const;

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/media-library/index.library.ts')
    >()),
    getMediaAssetBlob: getMediaAssetBlobMock,
    getMediaLibraryEntry: getMediaLibraryEntryMock,
  })
);

vi.mock('../../../workflows/editor/bootstrap', async (importOriginal) => ({
  ...(await importOriginal()),
  EDITOR_BOOTSTRAP_QUERY_PARAM: 'bootstrap',
  consumePendingEditorBootstrapPayload: consumePendingEditorBootstrapPayloadMock,
}));

vi.mock('@sniptale/runtime-contracts/editor/session', async (importOriginal) => ({
  ...(await importOriginal()),
  readEditorAssetId: readEditorAssetIdMock,
  readEditorSessionId: readEditorSessionIdMock,
}));

vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: createEditorSessionIdMock,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/apps/extension/src/editor/index.html');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ensureEditorPageSessionId', () => {
  it('keeps the existing session id without rewriting history', async () => {
    readEditorSessionIdMock.mockReturnValue('session-existing');
    readEditorAssetIdMock.mockReturnValue(null);
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    const { ensureEditorPageSessionId } = await import('./');

    const sessionId = ensureEditorPageSessionId({
      assetId: null,
      bootstrapId: null,
      sessionId: 'session-existing',
    });

    expect(sessionId).toBe('session-existing');
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it('creates a session id and updates the editor URL when the query is missing it', async () => {
    createEditorSessionIdMock.mockReturnValue('session-created');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    const { ensureEditorPageSessionId } = await import('./');

    const sessionId = ensureEditorPageSessionId({
      assetId: 'asset-1',
      bootstrapId: 'bootstrap-1',
      sessionId: null,
    });

    expect(sessionId).toBe('session-created');
    expect(replaceStateSpy).toHaveBeenCalledWith(
      {},
      '',
      '/apps/extension/src/editor/index.html?session=session-created'
    );
  });
});

describe('readEditorPageLocationState', () => {
  it('reads asset, bootstrap, and session ids from the current location search', async () => {
    readEditorAssetIdMock.mockReturnValue('asset-7');
    readEditorSessionIdMock.mockReturnValue('session-7');
    const { readEditorPageLocationState } = await import('./');

    const state = readEditorPageLocationState(
      '?asset=asset-7&bootstrap=bootstrap-7&session=session-7'
    );

    expect(state).toEqual({
      assetId: 'asset-7',
      bootstrapId: 'bootstrap-7',
      sessionId: 'session-7',
    });
  });
});

describe('resolveEditorPageRestoreSource draft precedence', () => {
  it('prefers a persisted draft over bootstrap or asset recovery', async () => {
    const draftEntry = {
      sessionId: 'session-1',
      document: createEditorDocumentFixture(),
      assetId: 'asset-1',
      sourceUrl: 'https://example.com',
      sourceTitle: 'Example',
      createdAt: 1,
      updatedAt: 2,
      dirty: true,
    };
    restoreEditorSessionDraftMock.mockResolvedValue(draftEntry);
    const { resolveEditorPageRestoreSource } = await import('./');

    const result = await resolveEditorPageRestoreSource(
      {
        assetId: 'asset-1',
        bootstrapId: 'bootstrap-1',
        sessionId: 'session-1',
      },
      'session-1',
      autosaveService
    );

    expect(result).toEqual({
      kind: 'draft',
      entry: draftEntry,
    });
    expect(consumePendingEditorBootstrapPayloadMock).not.toHaveBeenCalled();
    expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
  });
});

describe('resolveEditorPageRestoreSource bootstrap fallback', () => {
  it('falls back to bootstrap payload when no draft exists', async () => {
    restoreEditorSessionDraftMock.mockResolvedValue(undefined);
    consumePendingEditorBootstrapPayloadMock.mockResolvedValue({
      dataUrl: 'data:image/png;base64,bootstrap',
      sourceFaviconUrl: 'https://bootstrap.test/favicon.ico',
      title: 'Bootstrap',
      url: 'https://bootstrap.test',
    });
    const { resolveEditorPageRestoreSource } = await import('./');

    const result = await resolveEditorPageRestoreSource(
      {
        assetId: 'asset-2',
        bootstrapId: 'bootstrap-2',
        sessionId: 'session-2',
      },
      'session-2',
      autosaveService
    );

    expect(result).toEqual({
      kind: 'bootstrap',
      payload: {
        dataUrl: 'data:image/png;base64,bootstrap',
        sourceFaviconUrl: 'https://bootstrap.test/favicon.ico',
        title: 'Bootstrap',
        url: 'https://bootstrap.test',
      },
    });
    expect(consumePendingEditorBootstrapPayloadMock).toHaveBeenCalledWith('bootstrap-2');
    expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
  });
});

describe('resolveEditorPageRestoreSource asset fallback', () => {
  it('restores an asset-backed editor session when no draft or bootstrap exists', async () => {
    restoreEditorSessionDraftMock.mockResolvedValue(undefined);
    consumePendingEditorBootstrapPayloadMock.mockResolvedValue(null);
    getMediaAssetBlobMock.mockResolvedValue(new Blob(['asset'], { type: 'image/png' }));
    getMediaLibraryEntryMock.mockResolvedValue({
      filename: 'capture.png',
      sourceFavicon: 'https://example.test/favicon.ico',
      sourceTitle: 'Captured page',
      sourceUrl: 'https://example.test/page',
    });
    blobToDataUrlMock.mockResolvedValue('data:image/png;base64,asset');
    const { resolveEditorPageRestoreSource } = await import('./');

    const result = await resolveEditorPageRestoreSource(
      ASSET_RESTORE_LOCATION,
      'session-3',
      autosaveService
    );

    expect(result).toEqual({
      kind: 'asset',
      assetId: 'asset-3',
      dataUrl: 'data:image/png;base64,asset',
      filename: 'capture.png',
      sourceFaviconUrl: 'https://example.test/favicon.ico',
      sourceTitle: 'Captured page',
      sourceUrl: 'https://example.test/page',
    });
  });
});

describe('resolveEditorPageRestoreSource missing asset fallback', () => {
  it('returns an empty restore source when the asset blob is missing', async () => {
    restoreEditorSessionDraftMock.mockResolvedValue(undefined);
    consumePendingEditorBootstrapPayloadMock.mockResolvedValue(null);
    getMediaAssetBlobMock.mockResolvedValue(null);
    const { resolveEditorPageRestoreSource } = await import('./');

    const result = await resolveEditorPageRestoreSource(
      {
        assetId: 'asset-missing',
        bootstrapId: null,
        sessionId: 'session-missing',
      },
      'session-missing',
      autosaveService
    );

    expect(result).toEqual({ kind: 'empty' });
    expect(blobToDataUrlMock).not.toHaveBeenCalled();
  });
});

describe('resolveEditorPageRestoreSource empty fallback', () => {
  it('returns an empty source when there is no draft, bootstrap payload, or asset id', async () => {
    restoreEditorSessionDraftMock.mockResolvedValue(undefined);
    consumePendingEditorBootstrapPayloadMock.mockResolvedValue(null);
    const { resolveEditorPageRestoreSource } = await import('./');

    const result = await resolveEditorPageRestoreSource(
      {
        assetId: null,
        bootstrapId: null,
        sessionId: 'session-empty',
      },
      'session-empty',
      autosaveService
    );

    expect(result).toEqual({ kind: 'empty' });
  });
});
