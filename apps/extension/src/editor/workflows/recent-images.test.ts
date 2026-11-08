// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  entry: vi.fn(),
  blob: vi.fn(),
  thumbnail: vi.fn(),
  list: vi.fn(),
  presentation: vi.fn(),
  admission: vi.fn(),
  sessionId: 'current' as string | null,
}));
vi.mock('../../composition/persistence/media-library', () => ({
  getMediaLibraryEntry: mocks.entry,
  getMediaAssetBlob: mocks.blob,
  getMediaThumbnail: mocks.thumbnail,
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
import { listRecentEditorImages, readRecentEditorThumbnail } from './recent-images';
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
  mocks.thumbnail.mockReset().mockResolvedValue(undefined);
});
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
  expect(await readRecentEditorThumbnail('target')).toBe(await mocks.blob.mock.results[0]?.value);
});

it('formats source and last edit for the chooser without changing start-page dimensions', async () => {
  mocks.list.mockResolvedValue([
    { ...entry, sourceUrl: 'https://example.org/articles?private=hidden' },
    { ...entry, id: 'file', kind: 'image', sourceUrl: 'file:///private/example.png' },
    { ...entry, id: 'capture', sourceUrl: 'invalid' },
  ]);
  const { formatDateTime } = await import('../../platform/i18n');
  const stamp = formatDateTime(10, { dateStyle: 'short', timeStyle: 'short' }, 'en');
  expect((await listRecentEditorImages('source', 'en')).map((item) => item.detail)).toEqual([
    `example.org\n${stamp}`,
    `File\n${stamp}`,
    `Screen capture\n${stamp}`,
  ]);
  expect((await listRecentEditorImages('source', 'ru'))[1]?.detail).toContain('Файл\n');
  expect((await listRecentEditorImages())[0]?.detail).toBe('640 × 360');
});

it('includes never-opened image captures and imports from the whole library', async () => {
  mocks.list.mockResolvedValue([
    { ...entry, id: 'new-capture', workspaceRevision: 0, updatedAt: 300 },
    { ...entry, id: 'new-import', kind: 'image', workspaceRevision: 0, updatedAt: 200 },
    { ...entry, id: 'edited', workspaceRevision: 4, updatedAt: 100 },
  ]);
  expect((await listRecentEditorImages('source', 'en')).map((item) => item.id)).toEqual([
    'new-capture',
    'new-import',
    'edited',
  ]);
});

it('uses a source thumbnail when no edited presentation exists and refuses a changed or deleted entry', async () => {
  const original = new Blob(['base image']);
  mocks.entry.mockResolvedValue({ ...entry, workspaceRevision: 7 });
  mocks.presentation.mockResolvedValue(undefined);
  mocks.blob.mockResolvedValue(original);
  expect(await readRecentEditorThumbnail('target')).toBe(original);
  mocks.entry
    .mockResolvedValueOnce({ ...entry, workspaceRevision: 7 })
    .mockResolvedValueOnce(undefined);
  expect(await readRecentEditorThumbnail('target')).toBeUndefined();
  mocks.entry
    .mockResolvedValueOnce({ ...entry, workspaceRevision: 7 })
    .mockResolvedValueOnce({ ...entry, workspaceRevision: 8 });
  expect(await readRecentEditorThumbnail('target')).toBeUndefined();
});

it('prefers a stored base thumbnail before reading the full original source', async () => {
  const base = new Blob(['small base thumbnail']);
  mocks.entry.mockResolvedValue({ ...entry, workspaceRevision: 7 });
  mocks.presentation.mockResolvedValue(undefined);
  mocks.thumbnail.mockResolvedValue({ blob: base });
  expect(await readRecentEditorThumbnail('target')).toBe(base);
  expect(mocks.blob).not.toHaveBeenCalled();
});
