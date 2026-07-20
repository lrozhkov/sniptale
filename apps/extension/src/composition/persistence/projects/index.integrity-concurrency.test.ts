import { beforeEach, expect, it, vi } from 'vitest';

import { createVideoProjectEntry } from './index.test-support';

const mocks = vi.hoisted(() => ({
  dbGetAll: vi.fn(),
  initDB: vi.fn(),
  verifyIntegrity: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  MEDIA_LIBRARY_STORE: 'media_library',
  PROJECT_ASSETS_STORE: 'project_assets',
  VIDEO_PROJECTS_STORE: 'video_projects',
  initDB: mocks.initDB,
}));

vi.mock('../../../features/video/project/effect-instance', async (importOriginal) => ({
  ...(await importOriginal()),
  verifyVideoProjectEffectSnapshotIntegrity: mocks.verifyIntegrity,
}));

vi.mock('../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal()),
  publishMediaHubLibraryChanged: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initDB.mockResolvedValue({ getAll: mocks.dbGetAll });
});

it('bounds project snapshot readiness verification to one byte-level job at a time', async () => {
  const gates = [createGate(), createGate(), createGate()];
  let active = 0;
  let peak = 0;
  mocks.dbGetAll.mockResolvedValue([
    createVideoProjectEntry({ id: 'project-1' }),
    createVideoProjectEntry({ id: 'project-2' }),
    createVideoProjectEntry({ id: 'project-3' }),
  ]);
  mocks.verifyIntegrity.mockImplementation(async () => {
    const gate = gates[mocks.verifyIntegrity.mock.calls.length - 1]!;
    active += 1;
    peak = Math.max(peak, active);
    await gate.promise;
    active -= 1;
  });
  const { listVideoProjectReadResults } = await import('./index');

  const read = listVideoProjectReadResults();
  await vi.waitFor(() => expect(mocks.verifyIntegrity).toHaveBeenCalledTimes(1));
  gates[0]!.resolve();
  await vi.waitFor(() => expect(mocks.verifyIntegrity).toHaveBeenCalledTimes(2));
  gates[1]!.resolve();
  await vi.waitFor(() => expect(mocks.verifyIntegrity).toHaveBeenCalledTimes(3));
  gates[2]!.resolve();

  await expect(read).resolves.toHaveLength(3);
  expect(peak).toBe(1);
});

function createGate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
