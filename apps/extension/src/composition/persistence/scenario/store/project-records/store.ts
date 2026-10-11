import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { ScenarioProjectSnapshot } from '../../contracts';
import { createGuideProject } from '../../../../../features/scenario/project/public';
import { getScenarioProject, listScenarioProjects, saveScenarioProject } from '../../projects';
import type { SaveScenarioProjectOptions } from '../../projects/project';
import type { ScenarioProjectSummary } from '../../../../../features/scenario/contracts/types/project';
import { publishMediaHubLibraryChanged } from '../../../../../features/media-hub/events';
import { createScenarioStoreMutationQueue } from '../mutation-queue';

const enqueueProjectRecordMutation = createScenarioStoreMutationQueue();

/**
 * Creates a scenario project and returns its owner-issued committed snapshot.
 */
export async function createScenarioProjectRecord(name: string): Promise<ScenarioProjectSnapshot> {
  return enqueueProjectRecordMutation(async () => {
    const project = createGuideProject(name);
    const savedProject = await saveScenarioProject(project, {
      expectedRevision: null,
      storageClass: 'library',
    });
    publishMediaHubLibraryChanged('create', [`scenario:${savedProject.project.id}`]);
    return savedProject;
  });
}

/**
 * Loads a scenario project by id.
 */
export function getScenarioProjectRecord(id: string): Promise<GuideProject | undefined> {
  return getScenarioProject(id);
}

/**
 * Persists the edit buffer and returns the owner-issued committed snapshot.
 */
export async function saveScenarioProjectRecord(
  project: GuideProject,
  options: SaveScenarioProjectOptions = {}
): Promise<ScenarioProjectSnapshot> {
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
): Promise<GuideProject | undefined> {
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
): Promise<GuideProject | undefined> {
  return enqueueProjectRecordMutation(async () => {
    const project = await getScenarioProject(projectId);
    if (!project) {
      return undefined;
    }

    const updatedProject: GuideProject = {
      ...project,
      name: patch.name ?? project.name,
      tags: patch.tags ?? project.tags ?? [],
      updatedAt: Date.now(),
    };

    const savedProject = await saveScenarioProject(updatedProject, {
      baseUpdatedAt: project.updatedAt,
    });
    publishMediaHubLibraryChanged('update', [`scenario:${projectId}`]);
    return savedProject.project;
  });
}

/**
 * Lists stored scenario projects in recency order.
 */
export async function listScenarioProjectSummaries(): Promise<ScenarioProjectSummary[]> {
  return (await listScenarioProjects()).filter((project) => project.purpose !== 'step-template');
}
