import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  deleteScenarioProjectMock,
  getScenarioProjectV3Mock,
  listScenarioProjectsV3Mock,
  publishMediaHubLibraryChangedMock,
  saveScenarioProjectV3Mock,
} = vi.hoisted(() => ({
  deleteScenarioProjectMock: vi.fn(),
  getScenarioProjectV3Mock: vi.fn(),
  listScenarioProjectsV3Mock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  saveScenarioProjectV3Mock: vi.fn(),
}));

vi.mock('../../../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../projects')>()),
  deleteScenarioProject: deleteScenarioProjectMock,
  getScenarioProjectV3: getScenarioProjectV3Mock,
  listScenarioProjectsV3: listScenarioProjectsV3Mock,
  saveScenarioProjectV3: saveScenarioProjectV3Mock,
}));

vi.mock('../../../../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../features/media-hub/events')>()),
  publishMediaHubLibraryChanged: publishMediaHubLibraryChangedMock,
}));

import { createScenarioProjectV3 } from '../../../../../../features/scenario/project/v3';
import {
  createScenarioProjectRecordV3,
  deleteScenarioProjectRecordV3,
  getScenarioProjectRecordV3,
  listScenarioProjectSummariesV3,
  saveScenarioProjectRecordV3,
  updateScenarioProjectRecordMetadataV3,
} from './store';

beforeEach(() => {
  vi.clearAllMocks();
  getScenarioProjectV3Mock.mockResolvedValue(undefined);
  listScenarioProjectsV3Mock.mockResolvedValue([]);
  saveScenarioProjectV3Mock.mockImplementation(async (project) => project);
  deleteScenarioProjectMock.mockResolvedValue(undefined);
});

async function verifyProjectCrudLifecycle() {
  const project = createScenarioProjectV3('Scenario');
  const summary = { createdAt: 10, id: project.id, name: 'Scenario', tags: [], updatedAt: 20 };
  getScenarioProjectV3Mock.mockResolvedValue(project);
  listScenarioProjectsV3Mock.mockResolvedValue([summary]);

  await expect(createScenarioProjectRecordV3('Scenario')).resolves.toEqual(
    expect.objectContaining({
      name: 'Scenario',
      slides: [expect.objectContaining({ title: 'Scenario' })],
      version: 3,
    })
  );
  await expect(getScenarioProjectRecordV3(project.id)).resolves.toEqual(project);
  await expect(saveScenarioProjectRecordV3(project)).resolves.toEqual(project);
  await expect(listScenarioProjectSummariesV3()).resolves.toEqual([summary]);

  expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('create', [
    expect.stringMatching(/^scenario:/),
  ]);
  expect(saveScenarioProjectV3Mock).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Scenario', version: 3 }),
    { baseUpdatedAt: null }
  );
  expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('update', [
    `scenario:${project.id}`,
  ]);
}

async function verifyProjectMetadataUpdateLifecycle() {
  const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(50);
  const project = createScenarioProjectV3('Scenario');
  getScenarioProjectV3Mock.mockResolvedValue(project);

  try {
    const updated = await updateScenarioProjectRecordMetadataV3(project.id, {
      name: 'Renamed',
      tags: ['draft'],
    });

    expect(updated).toEqual(expect.objectContaining({ name: 'Renamed', tags: ['draft'] }));
    expect(saveScenarioProjectV3Mock).toHaveBeenCalledWith(
      expect.objectContaining({ id: project.id, name: 'Renamed', updatedAt: 50 }),
      { baseUpdatedAt: project.updatedAt }
    );
  } finally {
    dateNowSpy.mockRestore();
  }
}

async function verifyConcurrentMetadataMutationsPreserveEarlierWrites() {
  const project = createScenarioProjectV3('Scenario');
  let storedProject = { ...project, tags: [] };
  getScenarioProjectV3Mock.mockImplementation(async () => storedProject);
  saveScenarioProjectV3Mock.mockImplementation(async (nextProject) => {
    storedProject = nextProject;
  });

  await Promise.all([
    updateScenarioProjectRecordMetadataV3(project.id, { name: 'Renamed' }),
    updateScenarioProjectRecordMetadataV3(project.id, { tags: ['draft'] }),
  ]);

  expect(storedProject).toEqual(
    expect.objectContaining({
      name: 'Renamed',
      tags: ['draft'],
    })
  );
  expect(saveScenarioProjectV3Mock).toHaveBeenCalledTimes(2);
}

async function verifyMetadataReturnsPersistedRevisionForFollowUpSave() {
  const project = { ...createScenarioProjectV3('Scenario'), updatedAt: 10 };
  installRevisionCheckedProjectSaveMock(project);

  const renamedProject = await updateScenarioProjectRecordMetadataV3(project.id, {
    name: 'Renamed',
  });
  if (!renamedProject) {
    throw new Error('Expected renamed project');
  }
  const taggedProject = await saveScenarioProjectRecordV3(
    { ...renamedProject, tags: ['draft'] },
    { baseUpdatedAt: renamedProject.updatedAt }
  );

  expect(renamedProject.updatedAt).toBe(project.updatedAt + 1);
  expect(taggedProject).toEqual(expect.objectContaining({ tags: ['draft'], updatedAt: 12 }));
  expect(saveScenarioProjectV3Mock).toHaveBeenNthCalledWith(2, expect.any(Object), {
    baseUpdatedAt: renamedProject.updatedAt,
  });
}

function installRevisionCheckedProjectSaveMock(
  project: ReturnType<typeof createScenarioProjectV3>
) {
  let storedProject = project;
  getScenarioProjectV3Mock.mockImplementation(async () => storedProject);
  saveScenarioProjectV3Mock.mockImplementation(async (nextProject, options) => {
    if (options?.baseUpdatedAt !== storedProject.updatedAt) {
      throw new Error('stale test project save');
    }
    storedProject = { ...nextProject, updatedAt: storedProject.updatedAt + 1 };
    return storedProject;
  });
}

describe('scenario v3 project records store', () => {
  it('proxies project create, load, save, and list operations', verifyProjectCrudLifecycle);
  it('updates metadata with a refreshed timestamp', verifyProjectMetadataUpdateLifecycle);
  it(
    'serializes metadata mutations against the latest stored project',
    verifyConcurrentMetadataMutationsPreserveEarlierWrites
  );
  it(
    'returns persisted revisions for immediate follow-up project saves',
    verifyMetadataReturnsPersistedRevisionForFollowUpSave
  );

  it('preserves metadata fields omitted from a metadata patch', async () => {
    const project = { ...createScenarioProjectV3('Scenario'), tags: ['draft'] };
    getScenarioProjectV3Mock.mockResolvedValue(project);

    await expect(updateScenarioProjectRecordMetadataV3(project.id, {})).resolves.toMatchObject({
      name: 'Scenario',
      tags: ['draft'],
    });
  });

  it('keeps missing-project metadata update as a no-op', async () => {
    await expect(updateScenarioProjectRecordMetadataV3('missing', { name: 'Nope' })).resolves.toBe(
      undefined
    );
    expect(saveScenarioProjectV3Mock).not.toHaveBeenCalled();
  });

  it('deletes projects through the shared cascade delete seam', async () => {
    await deleteScenarioProjectRecordV3('project-1');

    expect(deleteScenarioProjectMock).toHaveBeenCalledWith('project-1');
    expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('delete', [
      'scenario:project-1',
    ]);
  });
});
