import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBackupMetadata } from '../../metadata';
import { prepareProjectDomains } from './prepare';
import { remapScenarioProjectEntry } from './remap';
import {
  createV3ScenarioMetadata,
  createV3ScenarioMetadataWithImageAsset,
  createV3ScenarioMetadataWithImageEditDocument,
} from './prepare-v3.test-support.ts';

const { dbGetMock, getScenarioProjectEntryMock, getVideoProjectMock, initDBMock, randomUuidMock } =
  vi.hoisted(() => ({
    dbGetMock: vi.fn(),
    getScenarioProjectEntryMock: vi.fn(),
    getVideoProjectMock: vi.fn(),
    initDBMock: vi.fn(),
    randomUuidMock: vi.fn(),
  }));

vi.mock(
  '../../../../composition/persistence/infrastructure/indexed-db/core',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/infrastructure/indexed-db/core')
    >()),
    PROJECT_ASSETS_STORE: 'project_assets',
    PROJECT_EXPORTS_STORE: 'project_exports',
    SCENARIO_ASSETS_STORE: 'scenario_assets',
    SCENARIO_EXPORTS_STORE: 'scenario_exports',
    SCENARIO_STEP_EDITOR_DOCUMENTS_STORE: 'scenario_step_editor_documents',
    STORE_NAME: 'recordings',
    initDB: initDBMock,
  })
);

vi.mock('../../../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/projects/index')>()),
  getVideoProject: getVideoProjectMock,
}));

vi.mock(
  '../../../../composition/persistence/scenario/projects/project',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../composition/persistence/scenario/projects/project')
    >()),
    getScenarioProjectEntry: getScenarioProjectEntryMock,
  })
);

beforeEach(() => {
  vi.clearAllMocks();
  dbGetMock.mockResolvedValue(undefined);
  initDBMock.mockResolvedValue({ get: dbGetMock });
  randomUuidMock.mockReset();
  vi.stubGlobal('crypto', { randomUUID: randomUuidMock });
});

describe('backup v3 scenario project restore preparation', () => {
  it('prepares v3 scenario project descriptors instead of silently skipping them', async () => {
    getScenarioProjectEntryMock.mockResolvedValue(undefined);

    await expect(
      prepareProjectDomains({ metadata: createV3ScenarioMetadata(), strategy: 'duplicate' })
    ).resolves.toMatchObject({
      scenarioProjects: [expect.objectContaining({ projectId: 'scenario-v3' })],
      skipped: 0,
    });
    expect(getScenarioProjectEntryMock).toHaveBeenCalledWith('scenario-v3');
    expect(getVideoProjectMock).not.toHaveBeenCalled();
  });

  it('accepts v3 scenario descriptors at the backup metadata boundary before preparation', async () => {
    getScenarioProjectEntryMock.mockResolvedValue(undefined);

    const metadata = parseBackupMetadata(createV3ScenarioMetadata());
    await expect(prepareProjectDomains({ metadata, strategy: 'duplicate' })).resolves.toMatchObject(
      { scenarioProjects: [expect.objectContaining({ projectId: 'scenario-v3' })], skipped: 0 }
    );
  });
});

describe('backup v3 scenario project conflicts', () => {
  it('remaps v3 scenario project ids when duplicate import resolves a conflict', async () => {
    getScenarioProjectEntryMock.mockResolvedValue({ id: 'scenario-v3' });
    randomUuidMock.mockReturnValue('new-scenario-v3');

    const prepared = await prepareProjectDomains({
      metadata: createV3ScenarioMetadata({ id: 'scenario-v3' }),
      strategy: 'duplicate',
    });
    const remapped = remapScenarioProjectEntry(prepared.scenarioProjects[0]!);

    expect(remapped).toMatchObject({
      id: 'new-scenario-v3',
      project: { id: 'new-scenario-v3', name: 'V3 Scenario Copy', version: 3 },
    });
  });

  it('duplicates a v3 scenario import when the same id belongs to an existing legacy project', async () => {
    getScenarioProjectEntryMock.mockResolvedValue({
      id: 'scenario-v3',
      project: { id: 'scenario-v3', version: 2 },
    });
    randomUuidMock.mockReturnValue('new-scenario-v3');

    await expect(
      prepareProjectDomains({
        metadata: createV3ScenarioMetadata({ id: 'scenario-v3' }),
        strategy: 'duplicate',
      })
    ).resolves.toMatchObject({
      scenarioProjects: [expect.objectContaining({ idChanged: true })],
    });
  });

  it('skips existing v3 scenario projects when skip conflict strategy is selected', async () => {
    getScenarioProjectEntryMock.mockResolvedValue({ id: 'scenario-v3' });

    await expect(
      prepareProjectDomains({ metadata: createV3ScenarioMetadata(), strategy: 'skip' })
    ).resolves.toMatchObject({ scenarioProjects: [], skipped: 1 });
  });
});

describe('backup v3 scenario project asset remapping', () => {
  it('remaps duplicated image asset references in live and trash slides', async () => {
    getScenarioProjectEntryMock.mockResolvedValue({ id: 'scenario-v3' });
    randomUuidMock.mockReturnValue('new-asset');

    const prepared = await prepareProjectDomains({
      metadata: createV3ScenarioMetadataWithImageAsset(),
      strategy: 'duplicate',
    });
    const remapped = remapScenarioProjectEntry(prepared.scenarioProjects[0]!);

    expect(remapped.project).toMatchObject({
      slides: [{ elements: [{ assetRef: { assetId: 'import-new-asset' } }] }],
      trash: [{ slide: { source: { assetId: 'import-new-asset' } } }],
    });
  });

  it('remaps colliding v3 scenario asset ids even when the project id is new', async () => {
    getScenarioProjectEntryMock.mockResolvedValue(undefined);
    dbGetMock.mockImplementation(async (storeName: string, id: string) =>
      storeName === 'scenario_assets' && id === 'asset-1' ? { id } : undefined
    );
    randomUuidMock.mockReturnValue('new-asset');

    const prepared = await prepareProjectDomains({
      metadata: createV3ScenarioMetadataWithImageAsset(),
      strategy: 'duplicate',
    });
    const remapped = remapScenarioProjectEntry(prepared.scenarioProjects[0]!);

    expect(prepared.scenarioProjects[0]).toMatchObject({ idChanged: false });
    expect(remapped).toMatchObject({
      project: { slides: [{ elements: [{ assetRef: { assetId: 'import-new-asset' } }] }] },
    });
  });
});

describe('backup v3 scenario project edit document remapping', () => {
  it('remaps image edit document ids when imported step documents collide', async () => {
    getScenarioProjectEntryMock.mockResolvedValue(undefined);
    mockExistingStepDocument();
    randomUuidMock.mockReturnValue('new-doc');

    const prepared = await prepareProjectDomains({
      metadata: createV3ScenarioMetadataWithImageEditDocument(),
      strategy: 'duplicate',
    });
    const remapped = remapScenarioProjectEntry(prepared.scenarioProjects[0]!);

    expect(prepared.scenarioProjects[0]?.stepIdMap.get('doc-1')).toBe('import-new-doc');
    expect(remapped).toMatchObject({
      project: { slides: [{ elements: [{ editDocumentId: 'import-new-doc' }] }] },
    });
  });

  it('remaps image edit document ids when the image has no current asset ref', async () => {
    getScenarioProjectEntryMock.mockResolvedValue(undefined);
    mockExistingStepDocument();
    randomUuidMock.mockReturnValue('new-doc');

    const prepared = await prepareProjectDomains({
      metadata: parseBackupMetadata(createV3ScenarioMetadataWithImageEditDocument('')),
      strategy: 'duplicate',
    });
    const remapped = remapScenarioProjectEntry(prepared.scenarioProjects[0]!);

    expect(remapped).toMatchObject({
      project: {
        slides: [{ elements: [{ assetRef: { assetId: '' }, editDocumentId: 'import-new-doc' }] }],
      },
    });
  });
});

function mockExistingStepDocument(): void {
  dbGetMock.mockImplementation(async (storeName: string, id: string) =>
    storeName === 'scenario_step_editor_documents' && id === 'doc-1' ? { stepId: id } : undefined
  );
}
