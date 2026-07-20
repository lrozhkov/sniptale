import { beforeEach, expect, it, vi } from 'vitest';

import { EXPECTED_STORES } from '../infrastructure/indexed-db/core.stores.ts';
import { AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY } from '../ai-settings/constants';
import { erasePersistentLocalExtensionData } from './cleanup';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';

function createStorageArea() {
  return {
    get: vi.fn().mockResolvedValue({}),
    isAvailable: vi.fn(() => true),
    remove: vi.fn<(...args: [string | string[]]) => Promise<void>>().mockResolvedValue(undefined),
    set: vi.fn(),
  };
}

function createErasureDeps() {
  return {
    browserStorageAreas: {
      local: createStorageArea(),
      session: createStorageArea(),
      sync: createStorageArea(),
    },
    editorBootstrapRetention: {
      erase: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      verifyEmpty: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    },
    indexedDb: {
      countStores: vi.fn<(storeNames: readonly string[]) => Promise<number>>().mockResolvedValue(0),
      clearStores: vi.fn<(storeNames: readonly string[]) => Promise<void>>().mockResolvedValue(),
    },
    videoPreviewCache: {
      erase: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      verifyEmpty: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
    },
  };
}

let deps: ReturnType<typeof createErasureDeps>;

beforeEach(() => {
  deps = createErasureDeps();
});

it('clears every IndexedDB store before removing browser storage keys', async () => {
  await erasePersistentLocalExtensionData(
    { includeAiProviderSecrets: true, preservePreferences: false },
    deps
  );

  expect(deps.indexedDb.clearStores).toHaveBeenCalledWith(EXPECTED_STORES);
  expect(deps.indexedDb.countStores).toHaveBeenCalledWith(EXPECTED_STORES);
  expect(deps.editorBootstrapRetention.erase).toHaveBeenCalledOnce();
  expect(deps.editorBootstrapRetention.verifyEmpty).toHaveBeenCalledTimes(2);
  expect(deps.videoPreviewCache.erase).toHaveBeenCalledOnce();
  expect(deps.videoPreviewCache.verifyEmpty).toHaveBeenCalledTimes(2);
  expect(deps.browserStorageAreas.local.remove).toHaveBeenCalled();
  expect(deps.browserStorageAreas.session.remove).toHaveBeenCalled();
  expect(deps.browserStorageAreas.sync.remove).toHaveBeenCalled();
  expect(deps.indexedDb.clearStores.mock.invocationCallOrder[0]).toBeLessThan(
    deps.browserStorageAreas.local.remove.mock.invocationCallOrder[0] ?? 0
  );
});

it('returns the keys removed from each browser storage area', async () => {
  deps.browserStorageAreas.local.get
    .mockResolvedValueOnce({
      'sniptale_video_editor_track_panel_prefs:project-1': { collapsed: true },
    })
    .mockResolvedValue({});
  deps.browserStorageAreas.session.get
    .mockResolvedValueOnce({
      'scenarioPresentationSession:session-1': { slideId: 'slide-1' },
    })
    .mockResolvedValue({});

  const result = await erasePersistentLocalExtensionData(
    { includeAiProviderSecrets: true, preservePreferences: false },
    deps
  );

  expect(result.indexedDbStoresCleared).toBe(EXPECTED_STORES.length);
  expect(result.success).toBe(true);
  expect(result.failedRequiredParticipantIds).toEqual([]);
  expect(result.participants).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'indexed-db:core', status: 'verified-empty' }),
      expect.objectContaining({ id: 'indexed-db:editor-bootstrap', status: 'verified-empty' }),
      expect.objectContaining({ id: 'indexed-db:video-preview-cache', status: 'verified-empty' }),
      expect.objectContaining({ id: 'browser-storage:local', status: 'verified-empty' }),
      expect.objectContaining({ id: 'browser-storage:session', status: 'verified-empty' }),
    ])
  );
  expect(result.localStorageKeysRemoved).toContain('llm_request_history');
  expect(result.localStorageKeysRemoved).toContain('sniptale_ai_provider_secrets');
  expect(result.localStorageKeysRemoved).toContain(
    'sniptale_video_editor_track_panel_prefs:project-1'
  );
  expect(result.sessionStorageKeysRemoved).toContain('diagnostics-active-sessions');
  expect(result.sessionStorageKeysRemoved).toContain(AI_SECRET_UNLOCK_REQUESTS_STORAGE_KEY);
  expect(result.sessionStorageKeysRemoved).toContain('scenarioPresentationSession:session-1');
  expect(result.syncStorageKeysRemoved).toContain('sniptale_settings');
});

it('keeps offscreen page storage inside the owner barrier and repeats final verification', async () => {
  const pageStorage = {
    erase: vi.fn(async () => 2),
    prepare: vi.fn(async () => undefined),
    release: vi.fn(async () => undefined),
    verifyEmpty: vi.fn(async () => true),
  };

  const result = await erasePersistentLocalExtensionData(
    { includeAiProviderSecrets: true, preservePreferences: false },
    { ...deps, extensionPageLocalStorage: pageStorage }
  );

  expect(pageStorage.prepare).toHaveBeenCalledOnce();
  expect(pageStorage.erase).toHaveBeenCalledWith({ preservePreferences: false });
  expect(pageStorage.verifyEmpty).toHaveBeenCalledTimes(2);
  expect(pageStorage.release).toHaveBeenCalledOnce();
  expect(result.participants).toContainEqual(
    expect.objectContaining({
      id: 'extension-page:local-storage',
      removedCount: 2,
      status: 'verified-empty',
    })
  );
});

it('skips unavailable browser storage areas without failing IndexedDB erasure', async () => {
  deps.browserStorageAreas.session.isAvailable.mockReturnValue(false);

  const result = await erasePersistentLocalExtensionData(
    { includeAiProviderSecrets: true, preservePreferences: false },
    deps
  );

  expect(deps.indexedDb.clearStores).toHaveBeenCalledWith(EXPECTED_STORES);
  expect(deps.browserStorageAreas.session.remove).not.toHaveBeenCalled();
  expect(result.success).toBe(false);
  expect(result.failedRequiredParticipantIds).toContain('browser-storage:session');
});

it('does not remove browser storage when a plan has no direct or prefix keys', async () => {
  const result = await erasePersistentLocalExtensionData(
    { includeAiProviderSecrets: false, preservePreferences: true },
    {
      browserStorageAreas: {
        local: { ...deps.browserStorageAreas.local, get: vi.fn().mockResolvedValue({}) },
        session: {
          ...deps.browserStorageAreas.session,
          get: vi.fn().mockResolvedValue({ unrelated: true }),
        },
        sync: { ...deps.browserStorageAreas.sync, isAvailable: vi.fn(() => false) },
      },
      indexedDb: deps.indexedDb,
      editorBootstrapRetention: deps.editorBootstrapRetention,
      videoPreviewCache: deps.videoPreviewCache,
    }
  );

  expect(result.syncStorageKeysRemoved).toEqual([]);
  expect(deps.browserStorageAreas.sync.remove).not.toHaveBeenCalled();
});

it('fails required verification when editor bootstrap retention is not empty after erasure', async () => {
  deps.editorBootstrapRetention.verifyEmpty.mockResolvedValueOnce(false);

  const result = await erasePersistentLocalExtensionData(
    { includeAiProviderSecrets: true, preservePreferences: false },
    deps
  );

  expect(result.success).toBe(false);
  expect(result.failedRequiredParticipantIds).toContain('indexed-db:editor-bootstrap');
  expect(result.participants).toContainEqual(
    expect.objectContaining({
      id: 'indexed-db:editor-bootstrap',
      remainingCount: 1,
      status: 'failed',
    })
  );
});

it('fails required verification when derived preview media remains after erasure', async () => {
  deps.videoPreviewCache.verifyEmpty.mockResolvedValueOnce(false);

  const result = await erasePersistentLocalExtensionData(
    { includeAiProviderSecrets: true, preservePreferences: true },
    deps
  );

  expect(result.success).toBe(false);
  expect(result.failedRequiredParticipantIds).toContain('indexed-db:video-preview-cache');
});

it('returns a fixed participant failure without exposing storage error data', async () => {
  deps.indexedDb.clearStores.mockRejectedValueOnce(new Error('secret-bearing storage failure'));

  const result = await erasePersistentLocalExtensionData(
    { includeAiProviderSecrets: true, preservePreferences: false },
    deps
  );

  expect(result.participants).toContainEqual(
    expect.objectContaining({
      error: 'Local data erasure participant failed',
      id: 'indexed-db:core',
      status: 'failed',
    })
  );
  expect(JSON.stringify(result)).not.toContain('secret-bearing');
});

it('queues persistent recreation until final participant verification completes', async () => {
  let finishVerification!: (remainingCount: number) => void;
  deps.indexedDb.countStores.mockReturnValueOnce(
    new Promise<number>((resolve) => {
      finishVerification = resolve;
    })
  );
  const erasure = erasePersistentLocalExtensionData(
    { includeAiProviderSecrets: true, preservePreferences: false },
    deps
  );
  await vi.waitFor(() => expect(deps.indexedDb.countStores).toHaveBeenCalledOnce());

  const lateWriter = vi.fn(async () => undefined);
  const lateMutation = runWithPersistenceMutationPermit(lateWriter);
  await Promise.resolve();
  expect(lateWriter).not.toHaveBeenCalled();

  finishVerification(0);
  await expect(erasure).resolves.toEqual(expect.objectContaining({ success: true }));
  await expect(lateMutation).resolves.toBeUndefined();
  expect(lateWriter).toHaveBeenCalledOnce();
});
