import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPreparedDomains,
  createMinimalPreparedDomains,
  createMissingProjectBlobZip,
  createStores,
  createZip,
} from './test-support';

const { initDBMock } = vi.hoisted(() => ({
  initDBMock: vi.fn(),
}));

vi.mock(
  '../../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
    >()),
    initDB: initDBMock,
  })
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('backup project restore atomic preflight', () => {
  it('rejects missing project blobs before opening a restore transaction', async () => {
    const { restorePreparedProjectDomains } = await import('.');

    await expect(
      restorePreparedProjectDomains(createMinimalPreparedDomains(), createMissingProjectBlobZip())
    ).rejects.toThrow('recording.');

    expect(initDBMock).not.toHaveBeenCalled();
  });

  it('rejects unsafe project asset blobs before opening a restore transaction', async () => {
    const { restorePreparedProjectDomains } = await import('.');
    const prepared = createPreparedDomains();
    prepared.videoProjects[0]!.descriptor.projectAssets[0]!.entry.mimeType = 'image/svg+xml';

    await expect(
      restorePreparedProjectDomains(prepared, createUnsafeProjectAssetZip())
    ).rejects.toThrow('Unsupported project asset MIME type');

    expect(initDBMock).not.toHaveBeenCalled();
  });

  it('rejects malformed scenario asset entries before opening a restore transaction', async () => {
    const { restorePreparedProjectDomains } = await import('.');
    const prepared = createPreparedDomains();
    Reflect.set(prepared.scenarioProjects[0]!.descriptor.assets[0]!.entry, 'width', 'wide');

    await expect(
      restorePreparedProjectDomains(prepared, createUnsafeProjectAssetZip())
    ).rejects.toThrow('Invalid scenario asset backup entry');

    expect(initDBMock).not.toHaveBeenCalled();
  });
});

describe('backup project restore transaction lifecycle', () => {
  it('materializes every archive blob before opening the restore transaction', async () => {
    const { restorePreparedProjectDomains } = await import('.');
    const stores = createStores();
    let releaseArchiveRead!: () => void;
    let transactionOpened = false;
    const archiveReadGate = new Promise<void>((resolve) => {
      releaseArchiveRead = resolve;
    });
    const { firstRead, zip } = createDelayedProjectBlobZip(
      archiveReadGate,
      () => transactionOpened
    );
    const transaction = vi.fn(() => {
      transactionOpened = true;
      return {
        done: Promise.resolve(),
        objectStore: (name: string) => stores.get(name),
      };
    });
    initDBMock.mockResolvedValue({ transaction });

    const restore = restorePreparedProjectDomains(createPreparedDomains(), zip);
    await vi.waitFor(() => expect(firstRead).toHaveBeenCalled());
    expect(initDBMock).not.toHaveBeenCalled();
    releaseArchiveRead();

    await expect(restore).resolves.toBe(2);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('backup project restore rollback', () => {
  it('aborts the transaction when a prepared write rejects', async () => {
    const { restorePreparedProjectDomains } = await import('.');
    const stores = createStores();
    stores.get('video_projects')?.put.mockRejectedValue(new Error('write failed'));
    const abort = vi.fn();
    initDBMock.mockResolvedValue({
      transaction: vi.fn(() => ({
        abort,
        done: Promise.resolve(),
        objectStore: (name: string) => stores.get(name),
      })),
    });

    await expect(
      restorePreparedProjectDomains(createPreparedDomains(), createZip())
    ).rejects.toThrow('write failed');
    expect(abort).toHaveBeenCalledOnce();
  });
});

function createDelayedProjectBlobZip(
  gate: Promise<void>,
  transactionOpened: () => boolean
): { firstRead: ReturnType<typeof vi.spyOn>; zip: JSZip } {
  const zip = new JSZip();
  for (const path of projectBlobPaths()) {
    zip.file(
      path,
      gate.then(() => {
        if (transactionOpened()) throw new Error('archive read crossed transaction boundary');
        return path;
      })
    );
  }
  const firstEntry = zip.file('project-asset');
  if (!firstEntry) throw new Error('delayed project blob fixture is incomplete');
  return { firstRead: vi.spyOn(firstEntry, 'async'), zip };
}

function createUnsafeProjectAssetZip(): JSZip {
  const zip = new JSZip();
  for (const path of projectBlobPaths()) {
    zip.file(path, path === 'project-asset' ? '<svg></svg>' : path);
  }
  return zip;
}

function projectBlobPaths(): string[] {
  return [
    'export-thumb',
    'project-asset',
    'recording',
    'scenario-asset',
    'scenario-export-thumb',
    'scenario-thumb',
    'video-thumb',
  ];
}
