import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getScenarioProjectMock, saveScenarioProjectMock } = vi.hoisted(() => ({
  getScenarioProjectMock: vi.fn(),
  saveScenarioProjectMock: vi.fn(),
}));

vi.mock('../../projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../projects')>();
  return {
    ...actual,
    getScenarioProject: getScenarioProjectMock,
    saveScenarioProject: saveScenarioProjectMock,
  };
});

import { createScenarioCaptureStep } from '../../../../../features/scenario/project/public';
import { createScenarioStoreProjectFixture } from '../test.helpers.ts';
import {
  deleteScenarioStepFromProject,
  moveScenarioStepInProject,
  restoreScenarioStepFromProject,
} from './project-step-persistence';

beforeEach(() => {
  vi.clearAllMocks();
  getScenarioProjectMock.mockResolvedValue(undefined);
  saveScenarioProjectMock.mockImplementation(async (project) => project);
});

function createProjectFixture() {
  const firstStep = createScenarioCaptureStep({ assetId: 'asset-1', title: 'First' });
  const secondStep = createScenarioCaptureStep({ assetId: 'asset-2', title: 'Second' });

  return {
    firstStep,
    secondStep,
    project: {
      ...createScenarioStoreProjectFixture(),
      steps: [firstStep, secondStep],
    },
  };
}

async function verifyMutationPersistenceLifecycle() {
  const { firstStep, secondStep, project } = createProjectFixture();
  getScenarioProjectMock.mockResolvedValue(project);

  const reorderedProject = await moveScenarioStepInProject(project.id, secondStep.id, 0);
  const deletedProject = await deleteScenarioStepFromProject(project.id, firstStep.id);
  getScenarioProjectMock.mockResolvedValue(deletedProject);
  const restoredProject = await restoreScenarioStepFromProject(project.id, firstStep.id);

  expect(reorderedProject?.steps.map((step) => step.id)).toEqual([secondStep.id, firstStep.id]);
  expect(deletedProject?.steps.map((step) => step.id)).toEqual([secondStep.id]);
  expect(restoredProject?.steps.map((step) => step.id)).toEqual([firstStep.id, secondStep.id]);
  expect(saveScenarioProjectMock).toHaveBeenCalledTimes(3);
  expect(saveScenarioProjectMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ id: project.id }),
    { baseUpdatedAt: project.updatedAt }
  );
  expect(saveScenarioProjectMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ id: project.id }),
    { baseUpdatedAt: project.updatedAt }
  );
  expect(saveScenarioProjectMock).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({ id: project.id }),
    { baseUpdatedAt: deletedProject?.updatedAt }
  );
}

async function verifyNoOpPersistenceLifecycle() {
  const { firstStep, project } = createProjectFixture();
  const deletedProject = {
    ...project,
    steps: project.steps.slice(1),
    trash: [
      {
        deletedAt: 30,
        originalIndex: 0,
        step: firstStep,
      },
    ],
  };
  getScenarioProjectMock
    .mockResolvedValueOnce(project)
    .mockResolvedValueOnce(deletedProject)
    .mockResolvedValueOnce(project)
    .mockResolvedValueOnce(undefined);

  const untouchedMove = await moveScenarioStepInProject(project.id, firstStep.id, 0);
  const untouchedDelete = await deleteScenarioStepFromProject(project.id, 'missing');
  const untouchedRestore = await restoreScenarioStepFromProject(project.id, 'missing');
  const missingMove = await moveScenarioStepInProject('missing', firstStep.id, 1);

  expect(untouchedMove).toBe(project);
  expect(untouchedDelete).toBe(deletedProject);
  expect(untouchedRestore).toBe(project);
  expect(missingMove).toBeUndefined();
  expect(saveScenarioProjectMock).not.toHaveBeenCalled();
}

async function verifyStepMutationsReturnPersistedRevisionForFollowUpMutation() {
  const { firstStep, secondStep, project } = createProjectFixture();
  installRevisionCheckedProjectSaveMock(project);

  const movedProject = await moveScenarioStepInProject(project.id, secondStep.id, 0);
  if (!movedProject) {
    throw new Error('Expected moved project');
  }
  const deletedProject = await deleteScenarioStepFromProject(project.id, firstStep.id);

  expect(movedProject.updatedAt).toBe(project.updatedAt + 1);
  expect(deletedProject).toEqual(expect.objectContaining({ updatedAt: project.updatedAt + 2 }));
  expect(saveScenarioProjectMock).toHaveBeenNthCalledWith(2, expect.any(Object), {
    baseUpdatedAt: movedProject.updatedAt,
  });
}

function installRevisionCheckedProjectSaveMock(
  project: ReturnType<typeof createProjectFixture>['project']
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

describe('project step persistence', () => {
  it('persists delete, restore, and reorder mutations', verifyMutationPersistenceLifecycle);
  it('skips persistence for no-op and missing-project mutations', verifyNoOpPersistenceLifecycle);
  it(
    'returns persisted revisions for immediate follow-up step mutations',
    verifyStepMutationsReturnPersistedRevisionForFollowUpMutation
  );
});
