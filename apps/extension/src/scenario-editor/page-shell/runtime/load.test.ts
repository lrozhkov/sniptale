import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createScenarioProjectRecordV3Mock,
  getScenarioProjectRecordV3Mock,
  listScenarioProjectSummariesV3Mock,
} = vi.hoisted(() => ({
  createScenarioProjectRecordV3Mock: vi.fn(),
  getScenarioProjectRecordV3Mock: vi.fn(),
  listScenarioProjectSummariesV3Mock: vi.fn(),
}));

vi.mock('../../../composition/persistence/scenario/store/v3', () => ({
  createScenarioProjectRecordV3: createScenarioProjectRecordV3Mock,
  getScenarioProjectRecordV3: getScenarioProjectRecordV3Mock,
  listScenarioProjectSummariesV3: listScenarioProjectSummariesV3Mock,
}));

import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { loadScenarioV3EditorProject } from './load';

beforeEach(() => {
  vi.clearAllMocks();
  createScenarioProjectRecordV3Mock.mockResolvedValue(createScenarioProjectV3('Created'));
  getScenarioProjectRecordV3Mock.mockResolvedValue(undefined);
  listScenarioProjectSummariesV3Mock.mockResolvedValue([]);
});

describe('loadScenarioV3EditorProject', () => {
  it('loads the requested v3 project before consulting recent projects', async () => {
    const requestedProject = createScenarioProjectV3('Requested');
    getScenarioProjectRecordV3Mock.mockResolvedValue(requestedProject);

    await expect(loadScenarioV3EditorProject('project-1', 'New')).resolves.toBe(requestedProject);

    expect(getScenarioProjectRecordV3Mock).toHaveBeenCalledWith('project-1');
    expect(listScenarioProjectSummariesV3Mock).not.toHaveBeenCalled();
  });

  it('falls back to the latest v3 project summary when the requested project is missing', async () => {
    const latestProject = createScenarioProjectV3('Latest');
    getScenarioProjectRecordV3Mock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(latestProject);
    listScenarioProjectSummariesV3Mock.mockResolvedValue([
      { createdAt: 1, id: latestProject.id, name: 'Latest', tags: [], updatedAt: 2 },
    ]);

    await expect(loadScenarioV3EditorProject('missing', 'New')).resolves.toBe(latestProject);

    expect(getScenarioProjectRecordV3Mock).toHaveBeenLastCalledWith(latestProject.id);
    expect(createScenarioProjectRecordV3Mock).not.toHaveBeenCalled();
  });

  it('creates the first v3 project when no existing project can be loaded', async () => {
    await expect(loadScenarioV3EditorProject(null, 'New scenario')).resolves.toMatchObject({
      name: 'Created',
      version: 3,
    });

    expect(createScenarioProjectRecordV3Mock).toHaveBeenCalledWith('New scenario');
  });
});
