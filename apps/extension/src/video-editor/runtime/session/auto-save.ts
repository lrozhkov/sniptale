import { useEffect, useRef, type MutableRefObject } from 'react';
import { getVideoProject } from '../../../composition/persistence/projects/index';
import { resolveVideoProjectReadResult } from '../../../composition/persistence/projects/contracts';
import { commitVideoProjectMutation } from '../../../composition/persistence/projects/index-mutations';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { VideoProjectAsset } from '../../../features/video/project/types/index';
import type { VideoProject } from '../../../features/video/project/types/index';
import type { VideoEditorLibrariesState } from '../app-model/types';
import type { VideoEditorSessionActions } from '../../contracts/commands/session';
import { replaceVideoEditorUrl } from '../browser-driver';

const logger = createLogger({ namespace: 'VideoEditorAutoSave' });

/**
 * Persists project changes with the same debounced save contract as the legacy entrypoint.
 */
export function useVideoEditorAutoSave(
  project: VideoProject | null,
  recordingId: string | null,
  setSaveState: VideoEditorSessionActions['setSaveState'],
  refreshProjects: VideoEditorLibrariesState['refreshProjects'],
  syncProjectRevision?: VideoEditorSessionActions['updateProject']
): void {
  const saveGenerationRef = useRef(0);
  const revisionSyncRef = useRef<{ id: string; revision: number } | null>(null);
  const persistedProjectIdRef = useRef<string | null>(null);
  const persistedRevisionRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!project) {
      return;
    }
    return scheduleVideoEditorAutoSave({
      persistedProjectIdRef,
      persistedRevisionRef,
      project,
      recordingId,
      refreshProjects,
      revisionSyncRef,
      saveGenerationRef,
      saveQueueRef,
      setSaveState,
      ...(syncProjectRevision ? { syncProjectRevision } : {}),
    });
  }, [project, recordingId, refreshProjects, setSaveState, syncProjectRevision]);
}

function scheduleVideoEditorAutoSave(args: {
  persistedProjectIdRef: MutableRefObject<string | null>;
  persistedRevisionRef: MutableRefObject<number | null>;
  project: VideoProject;
  recordingId: string | null;
  refreshProjects: VideoEditorLibrariesState['refreshProjects'];
  revisionSyncRef: MutableRefObject<{ id: string; revision: number } | null>;
  saveGenerationRef: MutableRefObject<number>;
  saveQueueRef: MutableRefObject<Promise<void>>;
  setSaveState: VideoEditorSessionActions['setSaveState'];
  syncProjectRevision?: VideoEditorSessionActions['updateProject'];
}): () => void {
  resetAutosaveRevisionForProject(
    args.project,
    args.persistedProjectIdRef,
    args.persistedRevisionRef
  );
  if (consumeAutosaveRevisionSync(args.project, args.revisionSyncRef)) {
    args.setSaveState('saved');
    return () => undefined;
  }
  const saveGeneration = args.saveGenerationRef.current + 1;
  args.saveGenerationRef.current = saveGeneration;
  args.setSaveState('saving');
  const timer = window.setTimeout(() => {
    runScheduledVideoProjectSave(args, saveGeneration);
  }, 350);
  return () => {
    window.clearTimeout(timer);
    args.saveGenerationRef.current += 1;
  };
}

function runScheduledVideoProjectSave(
  args: Parameters<typeof scheduleVideoEditorAutoSave>[0],
  saveGeneration: number
): void {
  queueVideoProjectSave(args)
    .then(() => {
      if (args.saveGenerationRef.current !== saveGeneration) {
        return;
      }
      args.setSaveState('saved');
      replaceVideoEditorUrl(args.project.id, args.recordingId);
      void args.refreshProjects();
    })
    .catch((saveError) => {
      if (args.saveGenerationRef.current !== saveGeneration) {
        return;
      }
      logger.error('Failed to save project', saveError);
      args.setSaveState('error');
    });
}

function queueVideoProjectSave(args: {
  persistedProjectIdRef: MutableRefObject<string | null>;
  persistedRevisionRef: MutableRefObject<number | null>;
  project: VideoProject;
  revisionSyncRef: MutableRefObject<{ id: string; revision: number } | null>;
  saveQueueRef: MutableRefObject<Promise<void>>;
  syncProjectRevision?: VideoEditorSessionActions['updateProject'];
}): Promise<VideoProject> {
  const savePromise = args.saveQueueRef.current
    .catch(() => undefined)
    .then(async () => {
      const baseRevision = args.persistedRevisionRef.current ?? args.project.updatedAt;
      const savedProject = await commitAutosaveProjectMutation(args.project, baseRevision);
      if (args.persistedProjectIdRef.current === savedProject.id) {
        args.persistedRevisionRef.current = savedProject.updatedAt;
      }
      syncSavedProjectRevision({
        project: args.project,
        revisionSyncRef: args.revisionSyncRef,
        savedProject,
        ...(args.syncProjectRevision ? { syncProjectRevision: args.syncProjectRevision } : {}),
      });
      return savedProject;
    });
  args.saveQueueRef.current = savePromise.then(
    () => undefined,
    () => undefined
  );
  return savePromise;
}

async function commitAutosaveProjectMutation(
  project: VideoProject,
  baseRevision: number
): Promise<VideoProject> {
  try {
    return await commitVideoProjectMutation(project, { baseRevision });
  } catch (error) {
    if (!isStaleVideoProjectSaveError(error)) {
      throw error;
    }
    return retryStaleAutosaveProjectMutation(project);
  }
}

async function retryStaleAutosaveProjectMutation(project: VideoProject): Promise<VideoProject> {
  const latestProject = await getVideoProject(project.id);
  const resolvedProject = resolveVideoProjectReadResult(latestProject);
  if (!resolvedProject) {
    throw new Error(`Video project ${project.id} no longer exists`);
  }
  const rebasedProject = rebaseAutosaveProject(project, resolvedProject);
  return commitVideoProjectMutation(rebasedProject, {
    baseRevision: resolvedProject.updatedAt,
  });
}

function rebaseAutosaveProject(project: VideoProject, latestProject: VideoProject): VideoProject {
  return {
    ...project,
    assets: mergeVideoProjectAssets(project.assets, latestProject.assets),
    updatedAt: latestProject.updatedAt,
  };
}

function mergeVideoProjectAssets(
  projectAssets: VideoProjectAsset[],
  latestAssets: VideoProjectAsset[]
): VideoProjectAsset[] {
  const assetIds = new Set(projectAssets.map((asset) => asset.id));
  return [...projectAssets, ...latestAssets.filter((asset) => !assetIds.has(asset.id))];
}

function isStaleVideoProjectSaveError(error: unknown): boolean {
  return error instanceof Error && error.name === 'StaleVideoProjectSaveError';
}

function resetAutosaveRevisionForProject(
  project: VideoProject,
  projectIdRef: MutableRefObject<string | null>,
  revisionRef: MutableRefObject<number | null>
): void {
  if (projectIdRef.current === project.id) {
    return;
  }
  projectIdRef.current = project.id;
  revisionRef.current = null;
}

function consumeAutosaveRevisionSync(
  project: VideoProject,
  revisionSyncRef: MutableRefObject<{ id: string; revision: number } | null>
): boolean {
  const revisionSync = revisionSyncRef.current;
  if (
    !revisionSync ||
    revisionSync.id !== project.id ||
    revisionSync.revision !== project.updatedAt
  ) {
    return false;
  }
  revisionSyncRef.current = null;
  return true;
}

function syncSavedProjectRevision(args: {
  project: VideoProject;
  revisionSyncRef: MutableRefObject<{ id: string; revision: number } | null>;
  savedProject: VideoProject;
  syncProjectRevision?: VideoEditorSessionActions['updateProject'];
}): void {
  if (!args.syncProjectRevision || args.savedProject.updatedAt === args.project.updatedAt) {
    return;
  }

  args.revisionSyncRef.current = {
    id: args.savedProject.id,
    revision: args.savedProject.updatedAt,
  };
  args.syncProjectRevision((currentProject) =>
    currentProject === args.project
      ? { ...currentProject, updatedAt: args.savedProject.updatedAt }
      : currentProject
  );
}
