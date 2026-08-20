import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertReplaceCanOwnScenarioChildConflicts,
  assertReplaceCanOwnVideoChildConflicts,
  createScenarioChildConflicts,
  createVideoChildConflicts,
  hasScenarioChildConflict,
  hasVideoChildConflict,
} from './conflicts';

const { dbGetMock, initDBMock } = vi.hoisted(() => ({
  dbGetMock: vi.fn(),
  initDBMock: vi.fn(),
}));

vi.mock(
  '../../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
    >()),
    initDB: initDBMock,
    PROJECT_ASSETS_STORE: 'project_assets',
    PROJECT_EXPORTS_STORE: 'project_exports',
    SCENARIO_ASSETS_STORE: 'scenario_assets',
    SCENARIO_EXPORTS_STORE: 'scenario_exports',
    SCENARIO_STEP_EDITOR_DOCUMENTS_STORE: 'scenario_step_editor_documents',
  })
);

beforeEach(() => {
  vi.clearAllMocks();
  initDBMock.mockResolvedValue({ get: dbGetMock });
});

describe('backup project video child conflicts', () => {
  it('accepts replace when a colliding project export belongs to the project', async () => {
    dbGetMock.mockImplementation(async (storeName: string, id: string) => {
      if (storeName === 'project_exports' && id === 'export-1') {
        return { id, projectId: 'video-1' };
      }
      return undefined;
    });

    const conflicts = await createVideoChildConflicts({
      projectAssetIds: [],
      projectExportIds: ['export-1'],
    });

    expect(hasVideoChildConflict(conflicts)).toBe(true);
    expect(() =>
      assertReplaceCanOwnVideoChildConflicts('replace', 'video-1', conflicts, new Set())
    ).not.toThrow();
  });

  it('rejects replace when a colliding project export belongs to another project', async () => {
    dbGetMock.mockResolvedValue({ id: 'export-1', projectId: 'other-project' });

    const conflicts = await createVideoChildConflicts({
      projectAssetIds: [],
      projectExportIds: ['export-1'],
    });

    expect(() =>
      assertReplaceCanOwnVideoChildConflicts('replace', 'video-1', conflicts, new Set())
    ).toThrow('Backup project child record conflicts with an existing record.');
  });
});

describe('backup project scenario child conflicts', () => {
  it('accepts replace when colliding scenario child records belong to the project', async () => {
    dbGetMock.mockResolvedValue({ id: 'asset-1', projectId: 'scenario-1' });

    const conflicts = await createScenarioChildConflicts({
      scenarioAssetIds: ['asset-1'],
      scenarioExportIds: [],
      stepIds: [],
    });

    expect(hasScenarioChildConflict(conflicts)).toBe(true);
    expect(() =>
      assertReplaceCanOwnScenarioChildConflicts('replace', 'scenario-1', conflicts)
    ).not.toThrow();
  });

  it('rejects replace when a colliding scenario child belongs to another project', async () => {
    dbGetMock.mockResolvedValue({ id: 'step-1', projectId: 'other' });

    const conflicts = await createScenarioChildConflicts({
      scenarioAssetIds: [],
      scenarioExportIds: [],
      stepIds: ['step-1'],
    });

    expect(() =>
      assertReplaceCanOwnScenarioChildConflicts('replace', 'scenario-1', conflicts)
    ).toThrow('Backup project child record conflicts with an existing record.');
  });
});
