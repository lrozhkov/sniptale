import { createScenarioProject } from '../../../../../features/scenario/project/public';
import { getScenarioProject, listScenarioProjects, saveScenarioProject } from '../../projects';
import type { SaveScenarioProjectOptions } from '../../projects/project';
import type {
  ScenarioProject,
  ScenarioProjectSummary,
} from '../../../../../features/scenario/contracts/types/project';
import { publishMediaHubLibraryChanged } from '../../../../../features/media-hub/events';
import { createScenarioStoreMutationQueue } from '../mutation-queue';

const enqueueProjectRecordMutation = createScenarioStoreMutationQueue();

/**
 * Creates and persists a new scenario project.
 */
export async function createScenarioProjectRecord(name: string): Promise<ScenarioProject> {
  return enqueueProjectRecordMutation(async () => {
    const project = createScenarioProject(name);
    const savedProject = await saveScenarioProject(project, { baseUpdatedAt: null });
    publishMediaHubLibraryChanged('create', [`scenario:${savedProject.id}`]);
    return savedProject;
  });
}

/**
 * Loads a scenario project by id.
 */
export function getScenarioProjectRecord(id: string): Promise<ScenarioProject | undefined> {
  return getScenarioProject(id);
}

/**
 * Persists the provided scenario project document.
 */
export async function saveScenarioProjectRecord(
  project: ScenarioProject,
  options: SaveScenarioProjectOptions = {}
): Promise<ScenarioProject> {
  return enqueueProjectRecordMutation(async () => {
    const savedProject = await saveScenarioProject(project, options);
    publishMediaHubLibraryChanged('update', [`scenario:${project.id}`]);
    return savedProject;
  });
}

/**
 * Renames an existing scenario project.
 */
export async function renameScenarioProjectRecord(
  projectId: string,
  name: string
): Promise<ScenarioProject | undefined> {
  return updateScenarioProjectRecordMetadata(projectId, {
    name,
  });
}

export async function updateScenarioProjectRecordMetadata(
  projectId: string,
  patch: {
    name?: string;
    tags?: string[];
  }
): Promise<ScenarioProject | undefined> {
  return enqueueProjectRecordMutation(async () => {
    const project = await getScenarioProject(projectId);
    if (!project) {
      return undefined;
    }

    const updatedProject: ScenarioProject = {
      ...project,
      name: patch.name ?? project.name,
      tags: patch.tags ?? project.tags ?? [],
      updatedAt: Date.now(),
    };

    const savedProject = await saveScenarioProject(updatedProject, {
      baseUpdatedAt: project.updatedAt,
    });
    publishMediaHubLibraryChanged('update', [`scenario:${projectId}`]);
    return savedProject;
  });
}

/**
 * Lists stored scenario projects in recency order.
 */
export function listScenarioProjectSummaries(): Promise<ScenarioProjectSummary[]> {
  return listScenarioProjects();
}
