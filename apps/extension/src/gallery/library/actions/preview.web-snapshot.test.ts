import { beforeEach, expect, it, vi } from 'vitest';
import { openInEditor } from './helpers';
import { createMediaItem } from './test-support/index';

const openWebSnapshotViewerPageMock = vi.hoisted(() => vi.fn());

vi.mock('../../../composition/persistence/media-library/index.library.ts', async () =>
  vi.importActual('../../../composition/persistence/media-library/index.library.ts')
);
vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { create: vi.fn() },
}));
vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: vi.fn(),
}));

vi.mock('../../../platform/navigation/extension-pages/editor', () => ({
  buildEditorUrl: vi.fn(),
}));
vi.mock('../../../platform/navigation/extension-pages/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages/index')>()),
  openScenarioEditorPage: vi.fn(),
  openVideoEditorPage: vi.fn(),
  openWebSnapshotViewerPage: openWebSnapshotViewerPageMock,
}));
vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  updateMediaLibraryEntrySafely: vi.fn(),
}));
vi.mock('../../../composition/persistence/scenario/store/public', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/scenario/store/public')
  >()),
  updateScenarioProjectRecordMetadata: vi.fn(),
}));

beforeEach(() => {
  openWebSnapshotViewerPageMock.mockReset();
});

it('opens web snapshot media items in the dedicated viewer page', () => {
  openInEditor(
    createMediaItem({
      entityId: 'snapshot-1',
      id: 'asset-web',
      kind: 'web-archive',
      source: { kind: 'web-snapshot', snapshotId: 'snapshot-1' },
    })
  );

  expect(openWebSnapshotViewerPageMock).toHaveBeenCalledWith('snapshot-1');
});
