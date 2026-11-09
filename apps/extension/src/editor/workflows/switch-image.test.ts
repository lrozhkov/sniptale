// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { createEditorDocumentFixture } from '../document/page-session/document.test-support';
import { beginEditorDocumentOpenOperation } from '../document/file-actions/operation';
const mocks = vi.hoisted(() => ({
  entry: vi.fn(),
  prepare: vi.fn(),
  sessionId: 'current' as string | null,
  setTitle: vi.fn(),
  setTime: vi.fn(),
}));
vi.mock('../../composition/persistence/media-library', () => ({
  getMediaLibraryEntry: mocks.entry,
}));
vi.mock('../document/page-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../document/page-session')>()),
  resolveEditorPageRestoreSource: mocks.prepare,
}));
vi.mock('../state/useEditorStore', () => ({
  useEditorStore: {
    getState: () => ({
      sessionId: mocks.sessionId,
      pageTitle: 'Current',
      capturedAt: 5,
      setPageTitle: mocks.setTitle,
      setCapturedAt: mocks.setTime,
    }),
  },
}));
vi.mock('../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: ({ assetId }: { assetId: string }) =>
    new URL(`/editor?assetId=${assetId}`, window.location.origin).toString(),
}));
import { openRecentEditorImage } from './switch-image';
const entry = { id: 'target', kind: 'screenshot', lifecycle: { storageClass: 'library' } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionId = 'current';
  mocks.entry.mockReset().mockResolvedValue(entry);
  window.history.replaceState({}, '', '/editor?assetId=current');
});
function setup() {
  const original = createEditorDocumentFixture();
  const target = { ...original, displayName: 'Target' };
  let displayed = original;
  const release = vi.fn();
  const preparedEntry = {
    aggregateId: 'target',
    revision: 7,
    document: target,
    sourceTitle: 'Target',
    sourceUrl: '',
    createdAt: 1,
    updatedAt: 2,
    releaseDocumentAssets: release,
  };
  mocks.prepare
    .mockReset()
    .mockResolvedValue({ kind: 'draft', entry: preparedEntry, capturedAt: 1 });
  const finish = vi.fn();
  const flush = vi.fn(async (serialize: () => unknown) => {
    expect(serialize()).toBe(original);
  });
  const autosave = {
    flushAutosave: flush,
    beginHydration: vi.fn(() => ({ finish, saveNow: vi.fn() })),
    saveNow: vi.fn(async (serialize: () => unknown) => {
      serialize();
    }),
    isEnabled: vi.fn(() => true),
    hasUnsavedChanges: vi.fn(() => false),
    adoptPreparedDocument: vi.fn(() => {
      mocks.sessionId = 'target';
    }),
  };
  const controller = {
    autosaveService: autosave,
    exportDocument: () => displayed,
    isDocumentReadyForExport: () => true,
    history: new SnapshotHistory('source undo'),
    originalDocument: original,
    loadDocument: vi.fn(async () => {
      displayed = target;
    }),
    openImage: vi.fn(async () => {
      displayed = target;
    }),
    applyDocument: vi.fn(async (document: typeof original) => {
      displayed = document;
    }),
    syncRuntimeState: vi.fn(),
  };
  return { controller, autosave, flush, finish, release, preparedEntry, original, target };
}
it('prepares and saves before loading, then adopts the destination and changes URL without navigation', async () => {
  const a = setup();
  await openRecentEditorImage({ id: 'target', controller: a.controller });
  expect(a.flush).toHaveBeenCalledOnce();
  expect(a.controller.loadDocument).toHaveBeenCalledWith(a.target, { preserveInspector: true });
  expect(a.autosave.adoptPreparedDocument).toHaveBeenCalledWith(a.preparedEntry);
  expect(a.flush.mock.invocationCallOrder[0]).toBeLessThan(
    a.controller.loadDocument.mock.invocationCallOrder[0]!
  );
  expect(a.controller.loadDocument.mock.invocationCallOrder[0]).toBeLessThan(
    a.autosave.adoptPreparedDocument.mock.invocationCallOrder[0]!
  );
  expect(location.search).toBe('?assetId=target');
  expect(a.release).not.toHaveBeenCalled();
  expect(a.finish).toHaveBeenCalledWith(true);
});
it.each(['missing', 'trashed', 'read', 'save', 'deleted-during-save'])(
  'preserves the current document on %s refusal',
  async (failure) => {
    const a = setup();
    if (failure === 'missing') mocks.entry.mockResolvedValue(undefined);
    if (failure === 'trashed')
      mocks.entry.mockResolvedValue({ ...entry, lifecycle: { trashedAt: 1 } });
    if (failure === 'read') mocks.prepare.mockRejectedValue(new Error('read refused'));
    if (failure === 'save') a.flush.mockRejectedValue(new Error('conflict'));
    if (failure === 'deleted-during-save')
      a.flush.mockImplementation(async () => {
        mocks.entry.mockResolvedValue(undefined);
      });
    await expect(
      openRecentEditorImage({ id: 'target', controller: a.controller })
    ).rejects.toThrow();
    expect(a.controller.loadDocument).not.toHaveBeenCalled();
    expect(location.search).toBe('?assetId=current');
    expect(a.controller.exportDocument()).toBe(a.original);
    if (failure === 'save' || failure === 'deleted-during-save')
      expect(a.release).toHaveBeenCalledOnce();
  }
);
it('rolls back a partially applied image, original and undo history before resuming source autosave', async () => {
  const a = setup();
  const history = a.controller.history;
  a.controller.loadDocument.mockImplementation(async () => {
    a.controller.history = new SnapshotHistory('target undo');
    a.controller.originalDocument = a.target;
    throw new Error('decode failed');
  });
  await expect(openRecentEditorImage({ id: 'target', controller: a.controller })).rejects.toThrow(
    'decode failed'
  );
  expect(a.controller.applyDocument).toHaveBeenCalledWith(
    a.original,
    expect.objectContaining({ resetHistory: false })
  );
  expect(a.controller.history).toBe(history);
  expect(a.controller.originalDocument).toBe(a.original);
  expect(a.finish).toHaveBeenCalledWith(true);
  expect(a.release).toHaveBeenCalledOnce();
  expect(a.autosave.adoptPreparedDocument).not.toHaveBeenCalled();
  expect(location.search).toBe('?assetId=current');
});
it('keeps hydration closed and source URL durable when rollback also fails', async () => {
  const a = setup();
  a.controller.loadDocument.mockRejectedValue(new Error('load'));
  a.controller.applyDocument.mockRejectedValue(new Error('restore'));
  await expect(
    openRecentEditorImage({ id: 'target', controller: a.controller })
  ).rejects.toMatchObject({ name: 'EditorSwitchRecoveryError' });
  expect(a.finish).toHaveBeenCalledWith(false);
  expect(a.release).toHaveBeenCalledOnce();
  expect(location.search).toBe('?assetId=current');
});
it.each(['session', 'open', 'dismiss'])(
  'rejects %s replacement during outgoing save',
  async (change) => {
    const a = setup();
    let active = true;
    a.flush.mockImplementation(async () => {
      if (change === 'session') mocks.sessionId = 'replacement';
      if (change === 'open') beginEditorDocumentOpenOperation(a.controller);
      if (change === 'dismiss') active = false;
    });
    await expect(
      openRecentEditorImage({ id: 'target', controller: a.controller, isActive: () => active })
    ).rejects.toThrow('changed');
    expect(a.controller.loadDocument).not.toHaveBeenCalled();
    expect(a.release).toHaveBeenCalledOnce();
  }
);
it('does not overwrite a newer opening that supersedes the canvas application', async () => {
  const a = setup();
  a.controller.loadDocument.mockImplementation(async () => {
    beginEditorDocumentOpenOperation(a.controller);
  });
  await openRecentEditorImage({ id: 'target', controller: a.controller });
  expect(a.controller.applyDocument).not.toHaveBeenCalled();
  expect(a.autosave.adoptPreparedDocument).not.toHaveBeenCalled();
  expect(a.release).toHaveBeenCalledOnce();
  expect(location.search).toBe('?assetId=current');
});
it('explicitly saves disabled-autosave edits before a switch', async () => {
  const a = setup();
  a.autosave.isEnabled.mockReturnValue(false);
  a.autosave.hasUnsavedChanges.mockReturnValue(true);
  await openRecentEditorImage({ id: 'target', controller: a.controller });
  expect(a.autosave.saveNow).toHaveBeenCalledOnce();
  expect(a.autosave.saveNow.mock.invocationCallOrder[0]).toBeLessThan(
    a.flush.mock.invocationCallOrder[0]!
  );
});
it.each(['library', 'temporary'])(
  'opens an original-image fallback from %s storage and adopts its existing root',
  async (storageClass) => {
    const a = setup();
    mocks.entry.mockResolvedValue({ ...entry, lifecycle: { storageClass } });
    mocks.prepare.mockResolvedValue({
      kind: 'asset',
      dataUrl: 'data:image/png;base64,target',
      filename: 'Target.png',
      nativeRevision: 0,
      sourceTitle: 'Original',
      sourceUrl: '',
      sourceFaviconUrl: null,
      capturedAt: 2,
    });
    await openRecentEditorImage({ id: 'target', controller: a.controller });
    expect(a.controller.openImage).toHaveBeenCalledOnce();
    expect(a.controller.loadDocument).not.toHaveBeenCalled();
    expect(a.autosave.adoptPreparedDocument).toHaveBeenCalledWith({
      aggregateId: 'target',
      revision: 0,
      sourceTitle: 'Original',
      sourceUrl: '',
    });
  }
);
it('leaves the already selected project untouched', async () => {
  const a = setup();
  await openRecentEditorImage({ id: 'current', controller: a.controller });
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(a.flush).not.toHaveBeenCalled();
});

it('restores source and retains source resource ownership if URL replacement is refused', async () => {
  const a = setup();
  const replace = vi.spyOn(window.history, 'replaceState');
  replace.mockImplementationOnce(() => {
    throw new Error('history refused');
  });
  await expect(openRecentEditorImage({ id: 'target', controller: a.controller })).rejects.toThrow(
    'history refused'
  );
  expect(a.autosave.adoptPreparedDocument).not.toHaveBeenCalled();
  expect(a.controller.applyDocument).toHaveBeenCalledOnce();
  expect(a.finish).toHaveBeenCalledWith(true);
  expect(a.release).toHaveBeenCalledOnce();
  expect(location.search).toBe('?assetId=current');
  replace.mockRestore();
});
