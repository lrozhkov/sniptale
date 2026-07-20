import {
  deleteScenarioProject,
  getScenarioProjectV3,
  listScenarioProjectsV3,
  saveScenarioProjectV3,
} from '../../../projects';
import type { SaveScenarioProjectOptions } from '../../../projects/project';
import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import { createScenarioProjectV3 } from '../../../../../../features/scenario/project/v3';
import { publishMediaHubLibraryChanged } from '../../../../../../features/media-hub/events';
import { createScenarioStoreMutationQueue } from '../../mutation-queue';

const enqueueProjectRecordMutationV3 = createScenarioStoreMutationQueue();

export async function createScenarioProjectRecordV3(name: string): Promise<ScenarioProjectV3> {
  return enqueueProjectRecordMutationV3(async () => {
    const project = createScenarioProjectV3(name);
    const savedProject = await saveScenarioProjectV3(project, { baseUpdatedAt: null });
    publishMediaHubLibraryChanged('create', [`scenario:${savedProject.id}`]);
    return savedProject;
  });
}

export function getScenarioProjectRecordV3(id: string): Promise<ScenarioProjectV3 | undefined> {
  return getScenarioProjectV3(id);
}

export function listScenarioProjectSummariesV3(): ReturnType<typeof listScenarioProjectsV3> {
  return listScenarioProjectsV3();
}

export async function saveScenarioProjectRecordV3(
  project: ScenarioProjectV3,
  options: SaveScenarioProjectOptions = {}
): Promise<ScenarioProjectV3> {
  return enqueueProjectRecordMutationV3(async () => {
    const savedProject = await saveScenarioProjectV3(project, options);
    publishMediaHubLibraryChanged('update', [`scenario:${project.id}`]);
    return savedProject;
  });
}

export async function updateScenarioProjectRecordMetadataV3(
  projectId: string,
  patch: {
    name?: string;
    tags?: string[];
  }
): Promise<ScenarioProjectV3 | undefined> {
  return enqueueProjectRecordMutationV3(async () => {
    const project = await getScenarioProjectV3(projectId);
    if (!project) {
      return undefined;
    }

    const updatedProject: ScenarioProjectV3 = {
      ...project,
      name: patch.name ?? project.name,
      tags: patch.tags ?? project.tags,
      updatedAt: Date.now(),
    };

    const savedProject = await saveScenarioProjectV3(updatedProject, {
      baseUpdatedAt: project.updatedAt,
    });
    publishMediaHubLibraryChanged('update', [`scenario:${projectId}`]);
    return savedProject;
  });
}

export async function deleteScenarioProjectRecordV3(projectId: string): Promise<void> {
  await enqueueProjectRecordMutationV3(async () => {
    await deleteScenarioProject(projectId);
    publishMediaHubLibraryChanged('delete', [`scenario:${projectId}`]);
  });
}
