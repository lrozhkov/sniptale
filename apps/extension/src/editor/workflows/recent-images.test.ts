// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
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
  expect(await readRecentEditorThumbnail('target')).toBeUndefined();
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
    `example.org · ${stamp}`,
    `File · ${stamp}`,
    `Screen capture · ${stamp}`,
  ]);
  expect((await listRecentEditorImages('source', 'ru'))[1]?.detail).toContain('Файл ·');
  expect((await listRecentEditorImages())[0]?.detail).toBe('640 × 360');
});
