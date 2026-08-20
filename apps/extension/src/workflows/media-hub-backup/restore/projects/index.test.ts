import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMinimalPreparedDomains,
  createPreparedDomains,
  createScenarioThumbnailNoRemapDomains,
  createStores,
  createZip,
} from './test-support';
import { assertPreparedProjectBlobsAvailable } from '../project/preflight';
import { commitPreparedProjectDomains } from '.';

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

describe('backup project restore writer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores prepared video and scenario bundles with remapped internal ids', async () => {
    const stores = createStores();
    initDBMock.mockResolvedValue(createTransactionDb(stores));
    await expect(
      preflightAndCommitPreparedProjectDomains(createPreparedDomains(), createZip())
    ).resolves.toBe(2);

    expect(stores.get('project_assets')?.put).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project-asset-copy', blob: expect.any(Blob) })
    );
    expect(stores.get('project_exports')?.put).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'export-copy', recordingId: 'recording-copy' })
    );
    expect(stores.get('scenario_assets')?.put).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'scenario-asset-copy', projectId: 'scenario-copy' })
    );
    expect(stores.get('scenario_step_editor_documents')?.put).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'scenario-copy', stepId: 'step-copy' })
    );
    expect(stores.get('thumbnails')?.put).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'scenario-export:scenario-export-copy' })
    );
  });

  it('commits the durable asset operation in the same final project transaction', async () => {
    const stores = createStores();
    stores.get('asset_operations')?.get.mockResolvedValue({
      compensations: [],
      createdAt: 1,
      kind: 'backup-restore',
      obsoleteAssetIds: [],
      operationId: 'restore-1',
      status: 'pending',
      updatedAt: 1,
    });
    initDBMock.mockResolvedValue(createTransactionDb(stores));
    const prepared = createPreparedDomains();
    await assertPreparedProjectBlobsAvailable(prepared, createZip());

    await commitPreparedProjectDomains({ operationId: 'restore-1', prepared });

    expect(stores.get('asset_operations')?.put).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'restore-1', status: 'committed' })
    );
  });

  it('rejects an export-bearing project commit without durable operation authority', async () => {
    const prepared = createPreparedDomains();
    await assertPreparedProjectBlobsAvailable(prepared, createZip());

    await expect(commitPreparedProjectDomains({ prepared })).rejects.toThrow(
      'requires a durable asset operation'
    );
    expect(initDBMock).not.toHaveBeenCalled();
  });
});

describe('backup project restore writer empty domains', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips project transactions when no v2 project domains are present', async () => {
    await expect(
      preflightAndCommitPreparedProjectDomains(createEmptyDomains(), createZip())
    ).resolves.toBe(0);
    expect(initDBMock).not.toHaveBeenCalled();
  });

  it('restores minimal bundles without optional thumbnails or telemetry', async () => {
    const stores = createStores();
    initDBMock.mockResolvedValue(createTransactionDb(stores));
    await expect(
      preflightAndCommitPreparedProjectDomains(createMinimalPreparedDomains(), createZip())
    ).resolves.toBe(2);

    expect(stores.get('project_exports')?.put).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'export-1', recordingId: 'recording-1' })
    );
    expect(stores.get('recording_telemetry')?.put).not.toHaveBeenCalled();
  });

  it('restores scenario export thumbnails when export ids are not remapped', async () => {
    const stores = createStores();
    initDBMock.mockResolvedValue(createTransactionDb(stores));
    await expect(
      preflightAndCommitPreparedProjectDomains(createScenarioThumbnailNoRemapDomains(), createZip())
    ).resolves.toBe(1);

    expect(stores.get('thumbnails')?.put).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'scenario-export:scenario-export-1' })
    );
  });
});

function createTransactionDb(stores: ReturnType<typeof createStores>) {
  return {
    transaction: vi.fn(() => ({
      done: Promise.resolve(),
      objectStore: (name: string) => stores.get(name),
    })),
  };
}

async function preflightAndCommitPreparedProjectDomains(
  prepared: Parameters<typeof commitPreparedProjectDomains>[0]['prepared'],
  zip: Parameters<typeof assertPreparedProjectBlobsAvailable>[1]
): Promise<number> {
  await assertPreparedProjectBlobsAvailable(prepared, zip);
  const operationId = prepared.videoProjects.some(
    (project) => project.descriptor.projectExports.length > 0
  )
    ? 'restore-1'
    : undefined;
  return commitPreparedProjectDomains({ ...(operationId ? { operationId } : {}), prepared });
}

function createEmptyDomains() {
  return {
    changedIds: [],
    conflictsResolved: 0,
    effectBundles: [],
    scenarioProjects: [],
    skipped: 0,
    videoProjects: [],
  };
}
