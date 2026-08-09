import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getAll: vi.fn(),
  initDB: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ warn: mocks.warn }),
}));
vi.mock('../infrastructure/indexed-db/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: mocks.initDB,
}));

import { getImageWorkspace, listImageWorkspaces } from '.';

function createWorkspace(aggregateId: string, updatedAt: number) {
  return {
    aggregateId,
    createdAt: 1,
    document: createEditorDocumentFixture(),
    revision: 1,
    sourceTitle: null,
    sourceUrl: null,
    updatedAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initDB.mockResolvedValue({ get: mocks.get, getAll: mocks.getAll });
});

it('returns a valid workspace and treats a missing row as absent without warning', async () => {
  const entry = createWorkspace('image-1', 10);
  mocks.get.mockResolvedValueOnce(entry).mockResolvedValueOnce(undefined);

  await expect(getImageWorkspace('image-1')).resolves.toEqual(entry);
  await expect(getImageWorkspace('missing')).resolves.toBeUndefined();
  expect(mocks.warn).not.toHaveBeenCalled();
});

it('fails closed and logs invalid persisted workspace rows', async () => {
  mocks.get.mockResolvedValue({ aggregateId: 'image-1', revision: 0 });

  await expect(getImageWorkspace('image-1')).resolves.toBeUndefined();
  expect(mocks.warn).toHaveBeenCalledWith('Ignoring invalid image workspace entry', {
    aggregateId: 'image-1',
  });
});

it('filters invalid rows and sorts valid workspaces by latest mutation', async () => {
  const older = createWorkspace('older', 10);
  const newer = createWorkspace('newer', 20);
  mocks.getAll.mockResolvedValue([older, { invalid: true }, newer]);

  await expect(listImageWorkspaces()).resolves.toEqual([newer, older]);
});
