import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMinimalPreparedDomains,
  createPreparedDomains,
  createScenarioThumbnailNoRemapDomains,
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

describe('backup project restore writer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores prepared video and scenario bundles with remapped internal ids', async () => {
    const stores = createStores();
    initDBMock.mockResolvedValue(createTransactionDb(stores));
    const { restorePreparedProjectDomains } = await import('.');

    await expect(restorePreparedProjectDomains(createPreparedDomains(), createZip())).resolves.toBe(
      2
    );

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
});

describe('backup project restore writer empty domains', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips project transactions when no v2 project domains are present', async () => {
    const { restorePreparedProjectDomains } = await import('.');

    await expect(restorePreparedProjectDomains(createEmptyDomains(), createZip())).resolves.toBe(0);
    expect(initDBMock).not.toHaveBeenCalled();
  });

  it('restores minimal bundles without optional thumbnails or telemetry', async () => {
    const stores = createStores();
    initDBMock.mockResolvedValue(createTransactionDb(stores));
    const { restorePreparedProjectDomains } = await import('.');

    await expect(
      restorePreparedProjectDomains(createMinimalPreparedDomains(), createZip())
    ).resolves.toBe(2);

    expect(stores.get('project_exports')?.put).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'export-1', recordingId: 'recording-1' })
    );
    expect(stores.get('recording_telemetry')?.put).not.toHaveBeenCalled();
  });

  it('restores scenario export thumbnails when export ids are not remapped', async () => {
    const stores = createStores();
    initDBMock.mockResolvedValue(createTransactionDb(stores));
    const { restorePreparedProjectDomains } = await import('.');

    await expect(
      restorePreparedProjectDomains(createScenarioThumbnailNoRemapDomains(), createZip())
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
