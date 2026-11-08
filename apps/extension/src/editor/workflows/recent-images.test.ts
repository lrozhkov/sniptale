// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../document/page-session/document.test-support';
import { beginEditorDocumentOpenOperation } from '../document/file-actions/operation';
const mocks = vi.hoisted(() => ({
  entry: vi.fn(),
  blob: vi.fn(),
  list: vi.fn(),
  presentation: vi.fn(),
  admission: vi.fn(),
  sessionId: 'current' as string | null,
}));
vi.mock('../../composition/persistence/media-library', () => ({
  getMediaLibraryEntry: mocks.entry,
  getMediaAssetBlob: mocks.blob,
  listMediaLibrary: mocks.list,
}));
vi.mock('../../composition/persistence/aggregate-presentations', () => ({
  getAggregatePresentation: mocks.presentation,
}));
vi.mock('../../workflows/sync-transfer/editing-admission', () => ({
  ensureNativeEditingRootAvailable: mocks.admission,
}));
vi.mock('../state/useEditorStore', () => ({
  useEditorStore: { getState: () => ({ sessionId: mocks.sessionId }) },
}));
vi.mock('../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: ({ assetId }: { assetId: string }) => `/editor?assetId=${assetId}`,
}));
import {
  listRecentEditorImages,
  openRecentEditorImage,
  readRecentEditorThumbnail,
} from './recent-images';
const entry = {
  id: 'target',
  filename: 'Target.png',
  kind: 'screenshot',
  width: 640,
  height: 360,
  updatedAt: 10,
  lifecycle: { storageClass: 'library' },
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessionId = 'current';
  mocks.entry.mockReset().mockResolvedValue(entry);
  mocks.blob.mockReset().mockResolvedValue(new Blob(['source']));
  mocks.admission.mockReset().mockResolvedValue(undefined);
});
function setup() {
  const document = createEditorDocumentFixture();
  const flush = vi.fn(async (serialize: () => unknown) => {
    serialize();
  });
  const controller = {
    autosaveService: { flushAutosave: flush },
    exportDocument: () => document,
    isDocumentReadyForExport: () => true,
  };
  const navigate = vi.fn();
  return { controller, flush, navigate, document };
}
it('reuses library-only image metadata and revision-matched edited previews', async () => {
  mocks.list.mockResolvedValue([
    entry,
    { ...entry, id: 'video', kind: 'video' },
    { ...entry, id: 'trash', lifecycle: { trashedAt: 5 } },
    { ...entry, id: 'temp', lifecycle: { storageClass: 'temporary' } },
  ]);
  expect(await listRecentEditorImages()).toEqual([
    {
      id: 'target',
      title: 'Target.png',
      detail: '640 × 360',
      updatedAt: 10,
      thumbnailId: 'target',
    },
  ]);
  mocks.entry.mockResolvedValue({ ...entry, workspaceRevision: 3 });
  const preview = new Blob(['edited']);
  mocks.presentation.mockResolvedValue({ presentationRevision: 3, previewBlob: preview });
  expect(await readRecentEditorThumbnail('target')).toBe(preview);
  mocks.presentation.mockResolvedValue({ presentationRevision: 2, previewBlob: preview });
  expect(await readRecentEditorThumbnail('target')).toBeUndefined();
});
it('admits target and saves current changes before navigating the same tab', async () => {
  const args = setup();
  await openRecentEditorImage({ ...args, id: 'target' });
  expect(args.flush).toHaveBeenCalledOnce();
  expect(args.navigate).toHaveBeenCalledWith('/editor?assetId=target');
  expect(mocks.admission.mock.invocationCallOrder[0]).toBeLessThan(
    args.flush.mock.invocationCallOrder[0]!
  );
  expect(args.flush.mock.invocationCallOrder[0]).toBeLessThan(
    args.navigate.mock.invocationCallOrder[0]!
  );
});
it.each(['missing', 'trashed', 'temporary', 'admission', 'source', 'save', 'deleted-during-save'])(
  'retains current document and URL after %s refusal',
  async (failure) => {
    const args = setup();
    if (failure === 'missing') mocks.entry.mockResolvedValue(undefined);
    if (failure === 'trashed')
      mocks.entry.mockResolvedValue({ ...entry, lifecycle: { trashedAt: 1 } });
    if (failure === 'temporary')
      mocks.entry.mockResolvedValue({ ...entry, lifecycle: { storageClass: 'temporary' } });
    if (failure === 'admission') mocks.admission.mockRejectedValue(new Error('refused'));
    if (failure === 'source') mocks.blob.mockResolvedValue(undefined);
    if (failure === 'save') args.flush.mockRejectedValue(new Error('conflict'));
    if (failure === 'deleted-during-save')
      args.flush.mockImplementation(async () => {
        mocks.entry.mockResolvedValue(undefined);
      });
    await expect(openRecentEditorImage({ ...args, id: 'target' })).rejects.toThrow();
    expect(args.navigate).not.toHaveBeenCalled();
    expect(mocks.sessionId).toBe('current');
    expect(args.controller.exportDocument()).toBe(args.document);
  }
);
it.each(['session', 'open', 'writer'])(
  'refuses a stale switch after %s changes during save',
  async (change) => {
    const args = setup();
    args.flush.mockImplementation(async () => {
      if (change === 'session') mocks.sessionId = 'replacement';
      if (change === 'open') beginEditorDocumentOpenOperation(args.controller);
      if (change === 'writer') args.controller.autosaveService = { flushAutosave: vi.fn() };
    });
    await expect(openRecentEditorImage({ ...args, id: 'target' })).rejects.toThrow('changed');
    expect(args.navigate).not.toHaveBeenCalled();
  }
);
it('keeps the existing disabled-autosave exit policy and does not force save', async () => {
  const args = setup();
  args.flush.mockImplementation(async () => undefined);
  await openRecentEditorImage({ ...args, id: 'target' });
  expect(args.navigate).toHaveBeenCalledOnce(); // Native beforeunload still owns the dirty-buffer warning.
});
it('leaves the current image selected without a read or navigation', async () => {
  const args = setup();
  await openRecentEditorImage({ ...args, id: 'current' });
  expect(mocks.entry).not.toHaveBeenCalled();
  expect(args.navigate).not.toHaveBeenCalled();
});

it('does not navigate after the chooser is dismissed while exit is pending', async () => {
  const args = setup();
  let active = true;
  args.flush.mockImplementation(async () => {
    active = false;
  });
  await expect(
    openRecentEditorImage({ ...args, id: 'target', isActive: () => active })
  ).rejects.toThrow('changed');
  expect(args.navigate).not.toHaveBeenCalled();
});
