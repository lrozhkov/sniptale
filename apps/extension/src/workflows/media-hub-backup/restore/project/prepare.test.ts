import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareProjectDomains } from './prepare';
import { remapId } from './ids';
import { remapScenarioProjectEntry, remapVideoProjectEntry } from './remap';
import { createVideoProjectEntryWithMediaClip } from '../../../../composition/persistence/projects/index.test-support.ts';
import {
  createLegacyScenarioProjectMetadata,
  createRestoreProjectMetadata,
} from './prepare.test-support.ts';

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
  getScenarioProjectEntryMock.mockResolvedValue({ id: 'scenario-1' });
  getVideoProjectMock.mockResolvedValue({ project: { id: 'video-1' }, status: 'ready' });
  dbGetMock.mockResolvedValue(undefined);
  initDBMock.mockResolvedValue({ get: dbGetMock });
  randomUuidMock.mockReset();
  vi.stubGlobal('crypto', { randomUUID: randomUuidMock });
});

describe('backup project restore preparation', () => {
  it('remaps duplicate video and scenario project-owned identifiers', async () => {
    const metadata = createRestoreProjectMetadata();
    randomUuidMock
      .mockReturnValueOnce('new-video')
      .mockReturnValueOnce('new-project-asset')
      .mockReturnValueOnce('new-export')
      .mockReturnValueOnce('new-recording')
      .mockReturnValueOnce('new-scenario')
      .mockReturnValueOnce('new-scenario-asset');

    const prepared = await prepareProjectDomains({
      metadata,
      strategy: 'duplicate',
    });
    const videoProject = prepared.videoProjects[0]!;
    const scenarioProject = prepared.scenarioProjects[0]!;
    const remappedScenario = remapScenarioProjectEntry(scenarioProject);

    if (remappedScenario.project.version !== 3) {
      throw new Error('Expected scenario v3 restore fixture');
    }

    expect(remapVideoProjectEntry(videoProject).project).toMatchObject({
      assets: [{ source: { projectAssetId: 'import-new-project-asset' } }],
      id: 'new-video',
      name: 'Video Copy',
    });
    expect(remapId(videoProject.projectExportIdMap, 'export-1')).toBe('import-new-export');
    expect(remappedScenario.project.slides[0]?.elements[0]).toMatchObject({
      assetRef: { assetId: 'import-new-scenario-asset' },
    });
  });
});

describe('backup project restore preparation conflict strategies', () => {
  it('skips conflicts and preserves identifiers when import is not duplicating', async () => {
    await expect(
      prepareProjectDomains({ metadata: createRestoreProjectMetadata(), strategy: 'skip' })
    ).resolves.toMatchObject({ scenarioProjects: [], skipped: 2, videoProjects: [] });

    getScenarioProjectEntryMock.mockResolvedValue(undefined);
    getVideoProjectMock.mockResolvedValue({ status: 'notFound' });
    const prepared = await prepareProjectDomains({
      metadata: createRestoreProjectMetadata(),
      strategy: 'replace',
    });

    expect(remapVideoProjectEntry(prepared.videoProjects[0]!)).toBe(
      prepared.videoProjects[0]!.descriptor.entry
    );
    expect(remapScenarioProjectEntry(prepared.scenarioProjects[0]!)).toBe(
      prepared.scenarioProjects[0]!.descriptor.entry
    );
    expect(remapId(prepared.videoProjects[0]!.projectAssetIdMap, 'project-asset-1')).toBe(
      'project-asset-1'
    );
  });
});

describe('backup project restore preparation child conflicts', () => {
  it('skips a project when only a child record conflicts under skip strategy', async () => {
    getScenarioProjectEntryMock.mockResolvedValue(undefined);
    getVideoProjectMock.mockResolvedValue({ status: 'notFound' });
    dbGetMock.mockImplementation(async (storeName: string, id: string) =>
      storeName === 'project_assets' && id === 'project-asset-1' ? { id } : undefined
    );

    await expect(
      prepareProjectDomains({ metadata: createRestoreProjectMetadata(), strategy: 'skip' })
    ).resolves.toMatchObject({ skipped: 1, videoProjects: [] });
  });

  it('remaps colliding video child ids even when the project id is new', async () => {
    getScenarioProjectEntryMock.mockResolvedValue(undefined);
    getVideoProjectMock.mockResolvedValue({ status: 'notFound' });
    dbGetMock.mockImplementation(async (storeName: string, id: string) =>
      storeName === 'project_assets' && id === 'project-asset-1' ? { id } : undefined
    );
    randomUuidMock.mockReturnValue('new-project-asset');

    const prepared = await prepareProjectDomains({
      metadata: {
        assets: [],
        effectBundles: [],
        scenarioProjects: [],
        videoProjects: onlyVideoProjects(),
      },
      strategy: 'duplicate',
    });

    expect(prepared.videoProjects[0]).toMatchObject({ idChanged: false, projectId: 'video-1' });
    expect(remapVideoProjectEntry(prepared.videoProjects[0]!).project).toMatchObject({
      assets: [{ source: { kind: 'project-asset', projectAssetId: 'import-new-project-asset' } }],
      id: 'video-1',
      name: 'Video',
    });
    expect(remapId(prepared.videoProjects[0]!.projectAssetIdMap, 'project-asset-1')).toBe(
      'import-new-project-asset'
    );
  });
});

describe('backup project restore preparation replace ownership', () => {
  it('allows replace when a colliding video project asset is owned by the existing project', async () => {
    getScenarioProjectEntryMock.mockResolvedValue(undefined);
    getVideoProjectMock.mockResolvedValue({
      project: createVideoProjectEntryWithMediaClip({ id: 'video-1' }).project,
      status: 'ready',
    });
    dbGetMock.mockImplementation(async (storeName: string, id: string) =>
      storeName === 'project_assets' && id === 'project-asset-1' ? { id } : undefined
    );

    await expect(
      prepareProjectDomains({
        metadata: {
          assets: [],
          effectBundles: [],
          scenarioProjects: [],
          videoProjects: onlyVideoProjects(),
        },
        strategy: 'replace',
      })
    ).resolves.toMatchObject({ skipped: 0, videoProjects: [expect.any(Object)] });
  });
});

describe('backup project restore preparation foreign child ownership', () => {
  it('rejects replace when a colliding video child belongs to another project', async () => {
    getScenarioProjectEntryMock.mockResolvedValue(undefined);
    getVideoProjectMock.mockResolvedValue({ project: { id: 'video-1' }, status: 'ready' });
    dbGetMock.mockImplementation(async (storeName: string, id: string) =>
      storeName === 'project_assets' && id === 'project-asset-1' ? { id } : undefined
    );

    await expect(
      prepareProjectDomains({
        metadata: {
          assets: [],
          effectBundles: [],
          scenarioProjects: [],
          videoProjects: onlyVideoProjects(),
        },
        strategy: 'replace',
      })
    ).rejects.toThrow('Backup project child record conflicts with an existing record.');
  });

  it('rejects replace when a colliding scenario child belongs to another project', async () => {
    getScenarioProjectEntryMock.mockResolvedValue({ id: 'scenario-1' });
    getVideoProjectMock.mockResolvedValue({ status: 'notFound' });
    dbGetMock.mockImplementation(async (storeName: string, id: string) =>
      storeName === 'scenario_assets' && id === 'asset-1'
        ? { id, projectId: 'other-scenario' }
        : undefined
    );

    await expect(
      prepareProjectDomains({
        metadata: {
          assets: [],
          effectBundles: [],
          scenarioProjects: onlyScenarioProjects(),
          videoProjects: [],
        },
        strategy: 'replace',
      })
    ).rejects.toThrow('Backup project child record conflicts with an existing record.');
  });
});

describe('backup project restore preparation cross-version conflicts', () => {
  it('rejects legacy scenario descriptors before conflict lookup', async () => {
    await expect(
      prepareProjectDomains({
        metadata: createLegacyScenarioProjectMetadata(),
        strategy: 'duplicate',
      })
    ).rejects.toThrow(/scenario project 2\./);
    expect(getScenarioProjectEntryMock).not.toHaveBeenCalled();
  });

  it('rejects legacy scenario descriptors at the remap boundary', () => {
    const descriptor = createLegacyScenarioProjectMetadata().scenarioProjects![0]!;

    expect(() =>
      remapScenarioProjectEntry({
        descriptor,
        idChanged: false,
        projectId: descriptor.entry.id,
        scenarioAssetIdMap: new Map(),
        scenarioExportIdMap: new Map(),
        stepIdMap: new Map(),
      })
    ).toThrow(/scenario project 2\./);
  });
});

function onlyScenarioProjects() {
  return createRestoreProjectMetadata().scenarioProjects ?? [];
}

function onlyVideoProjects() {
  return createRestoreProjectMetadata().videoProjects ?? [];
}
