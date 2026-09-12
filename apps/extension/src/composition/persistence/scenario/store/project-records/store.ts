import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { createGuideProject } from '../../../../../features/scenario/project/public';
import { getScenarioProject, listScenarioProjects, saveScenarioProject } from '../../projects';
import type { SaveScenarioProjectOptions } from '../../projects/project';
import type { ScenarioProjectSummary } from '../../../../../features/scenario/contracts/types/project';
import { publishMediaHubLibraryChanged } from '../../../../../features/media-hub/events';
import { createScenarioStoreMutationQueue } from '../mutation-queue';
import { loadSettings } from '../../../settings';
import { DEFAULT_LOCAL_STORAGE_POLICY } from '../../../library-lifecycle';

const enqueueProjectRecordMutation = createScenarioStoreMutationQueue();

/**
 * Creates and persists a new scenario project.
 */
export async function createScenarioProjectRecord(name: string): Promise<GuideProject> {
  return enqueueProjectRecordMutation(async () => {
    const project = createGuideProject(name);
    const settings = await loadSettings().catch(() => null);
    const savedProject = await saveScenarioProject(project, {
      baseUpdatedAt: null,
      storageClass:
        settings?.localStoragePolicy.defaultDestination ??
        DEFAULT_LOCAL_STORAGE_POLICY.defaultDestination,
    });
    publishMediaHubLibraryChanged('create', [`scenario:${savedProject.id}`]);
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
 * Persists the provided scenario project document.
 */
export async function saveScenarioProjectRecord(
  project: GuideProject,
  options: SaveScenarioProjectOptions = {}
): Promise<GuideProject> {
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
    return savedProject;
  });
}

/**
 * Lists stored scenario projects in recency order.
 */
export async function listScenarioProjectSummaries(): Promise<ScenarioProjectSummary[]> {
  return (await listScenarioProjects()).filter((project) => project.purpose !== 'step-template');
}
