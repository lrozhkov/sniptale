import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getScenarioProjectMock,
  listScenarioProjectsMock,
  publishMediaHubLibraryChangedMock,
  saveScenarioProjectMock,
} = vi.hoisted(() => ({
  getScenarioProjectMock: vi.fn(),
  listScenarioProjectsMock: vi.fn(),
  publishMediaHubLibraryChangedMock: vi.fn(),
  saveScenarioProjectMock: vi.fn(),
}));

vi.mock('../../projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../projects')>()),
  getScenarioProject: getScenarioProjectMock,
  listScenarioProjects: listScenarioProjectsMock,
  saveScenarioProject: saveScenarioProjectMock,
}));

vi.mock('../../../../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/media-hub/events')>()),
  publishMediaHubLibraryChanged: publishMediaHubLibraryChangedMock,
}));

import {
  createScenarioProjectRecord,
  getScenarioProjectRecord,
  listScenarioProjectSummaries,
  renameScenarioProjectRecord,
  saveScenarioProjectRecord,
  updateScenarioProjectRecordMetadata,
} from './store';
import { createScenarioStoreProjectFixture } from '../test.helpers.ts';

beforeEach(() => {
  vi.clearAllMocks();
  listScenarioProjectsMock.mockResolvedValue([]);
  saveScenarioProjectMock.mockImplementation(async (project) => project);
  getScenarioProjectMock.mockResolvedValue(undefined);
});

async function verifyProjectCrudLifecycle() {
  const project = createScenarioStoreProjectFixture();
  listScenarioProjectsMock.mockResolvedValue([
    { id: 'project-1', name: 'Scenario', createdAt: 10, updatedAt: 20 },
  ]);
  getScenarioProjectMock.mockResolvedValue(project);

  await expect(createScenarioProjectRecord('Scenario')).resolves.toEqual(
    expect.objectContaining({ name: 'Scenario', steps: [] })
  );
  await expect(getScenarioProjectRecord('project-1')).resolves.toEqual(project);
  await expect(saveScenarioProjectRecord(project)).resolves.toEqual(project);
  await expect(listScenarioProjectSummaries()).resolves.toEqual([
    { id: 'project-1', name: 'Scenario', createdAt: 10, updatedAt: 20 },
  ]);

  expect(saveScenarioProjectMock).toHaveBeenCalled();
  expect(saveScenarioProjectMock).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Scenario' }),
    { baseUpdatedAt: null }
  );
  expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('create', [
    expect.stringMatching(/^scenario:/),
  ]);
  expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('update', [
    `scenario:${project.id}`,
  ]);
}

async function verifyProjectRenameLifecycle() {
  const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(50);
  const project = createScenarioStoreProjectFixture();
  getScenarioProjectMock.mockResolvedValue(project);

  try {
    const renamedProject = await renameScenarioProjectRecord(project.id, 'Renamed project');

    expect(renamedProject).toEqual(
      expect.objectContaining({
        id: project.id,
        name: 'Renamed project',
        updatedAt: 50,
      })
    );
    expect(saveScenarioProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: project.id,
        name: 'Renamed project',
        updatedAt: 50,
      }),
      { baseUpdatedAt: project.updatedAt }
    );
    expect(publishMediaHubLibraryChangedMock).toHaveBeenCalledWith('update', [
      `scenario:${project.id}`,
    ]);
  } finally {
    dateNowSpy.mockRestore();
  }
}

async function verifyMissingRenameNoOp() {
  getScenarioProjectMock.mockResolvedValue(undefined);

  await expect(renameScenarioProjectRecord('missing', 'Renamed')).resolves.toBeUndefined();
  expect(saveScenarioProjectMock).not.toHaveBeenCalled();
}

async function verifyConcurrentMetadataMutationsPreserveEarlierWrites() {
  const project = createScenarioStoreProjectFixture();
  let storedProject = { ...project, tags: [] };
  getScenarioProjectMock.mockImplementation(async () => storedProject);
  saveScenarioProjectMock.mockImplementation(async (nextProject) => {
    storedProject = nextProject;
  });

  await Promise.all([
    updateScenarioProjectRecordMetadata(project.id, { name: 'Renamed project' }),
    updateScenarioProjectRecordMetadata(project.id, { tags: ['draft'] }),
  ]);

  expect(storedProject).toEqual(
    expect.objectContaining({
      name: 'Renamed project',
      tags: ['draft'],
    })
  );
  expect(saveScenarioProjectMock).toHaveBeenCalledTimes(2);
}

async function verifyMetadataReturnsPersistedRevisionForFollowUpSave() {
  const project = createScenarioStoreProjectFixture();
  installRevisionCheckedProjectSaveMock(project);

  const renamedProject = await updateScenarioProjectRecordMetadata(project.id, {
    name: 'Renamed project',
  });
  if (!renamedProject) {
    throw new Error('Expected renamed project');
  }
  const taggedProject = await saveScenarioProjectRecord(
    { ...renamedProject, tags: ['draft'] },
    { baseUpdatedAt: renamedProject.updatedAt }
  );

  expect(renamedProject.updatedAt).toBe(project.updatedAt + 1);
  expect(taggedProject).toEqual(expect.objectContaining({ tags: ['draft'], updatedAt: 12 }));
  expect(saveScenarioProjectMock).toHaveBeenNthCalledWith(2, expect.any(Object), {
    baseUpdatedAt: renamedProject.updatedAt,
  });
}

function installRevisionCheckedProjectSaveMock(
  project: ReturnType<typeof createScenarioStoreProjectFixture>
) {
  let storedProject = project;
  getScenarioProjectMock.mockImplementation(async () => storedProject);
  saveScenarioProjectMock.mockImplementation(async (nextProject, options) => {
    if (options?.baseUpdatedAt !== storedProject.updatedAt) {
      throw new Error('stale test project save');
    }
    storedProject = { ...nextProject, updatedAt: storedProject.updatedAt + 1 };
    return storedProject;
  });
}

describe('project records store', () => {
  it('proxies project create, load, save, and list operations', verifyProjectCrudLifecycle);
  it(
    'renames an existing project and persists the updated timestamp',
    verifyProjectRenameLifecycle
  );
  it('keeps missing-project rename as a no-op', verifyMissingRenameNoOp);
  it(
    'serializes metadata mutations against the latest stored project',
    verifyConcurrentMetadataMutationsPreserveEarlierWrites
  );
  it(
    'returns persisted revisions for immediate follow-up project saves',
    verifyMetadataReturnsPersistedRevisionForFollowUpSave
  );
});
