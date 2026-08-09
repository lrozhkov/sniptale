import { useEffect, useRef, type MutableRefObject } from 'react';
import { getVideoProject } from '../../../composition/persistence/projects/index';
import { resolveVideoProjectReadResult } from '../../../composition/persistence/projects/contracts';
import { commitVideoProjectWorkspaceMutation } from '../../../composition/persistence/projects/index-mutations';
import { createLogger } from '@sniptale/platform/observability/logger';
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
  const initialProjectUpdatedAtRef = useRef<number | null>(null);
  const persistedProjectIdRef = useRef<string | null>(null);
  const persistedRevisionRef = useRef<number | null | undefined>(undefined);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!project) {
      return;
    }
    return scheduleVideoEditorAutoSave({
      persistedProjectIdRef,
      persistedRevisionRef,
      initialProjectUpdatedAtRef,
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
  initialProjectUpdatedAtRef: MutableRefObject<number | null>;
  persistedProjectIdRef: MutableRefObject<string | null>;
  persistedRevisionRef: MutableRefObject<number | null | undefined>;
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
    args.initialProjectUpdatedAtRef,
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
  initialProjectUpdatedAtRef: MutableRefObject<number | null>;
  persistedProjectIdRef: MutableRefObject<string | null>;
  persistedRevisionRef: MutableRefObject<number | null | undefined>;
  project: VideoProject;
  revisionSyncRef: MutableRefObject<{ id: string; revision: number } | null>;
  saveQueueRef: MutableRefObject<Promise<void>>;
  syncProjectRevision?: VideoEditorSessionActions['updateProject'];
}): Promise<VideoProject> {
  const savePromise = args.saveQueueRef.current
    .catch(() => undefined)
    .then(async () => {
      const expectedWorkspaceRevision =
        args.persistedRevisionRef.current === undefined
          ? await resolveInitialWorkspaceRevision(
              args.project,
              args.initialProjectUpdatedAtRef.current
            )
          : args.persistedRevisionRef.current;
      const saved = await commitVideoProjectWorkspaceMutation(args.project, {
        expectedWorkspaceRevision,
      });
      if (args.persistedProjectIdRef.current === saved.project.id) {
        args.persistedRevisionRef.current = saved.workspaceRevision;
      }
      syncSavedProjectRevision({
        project: args.project,
        revisionSyncRef: args.revisionSyncRef,
        savedProject: saved.project,
        ...(args.syncProjectRevision ? { syncProjectRevision: args.syncProjectRevision } : {}),
      });
      return saved.project;
    });
  args.saveQueueRef.current = savePromise.then(
    () => undefined,
    () => undefined
  );
  return savePromise;
}

async function resolveInitialWorkspaceRevision(
  project: VideoProject,
  initialProjectUpdatedAt: number | null
): Promise<number | null> {
  const stored = await getVideoProject(project.id);
  if (stored.status === 'notFound') return null;
  if (stored.status !== 'ready') {
    throw new Error(`Video project ${project.id} is unavailable`);
  }
  const storedProject = resolveVideoProjectReadResult(stored);
  if (!storedProject || storedProject.updatedAt !== initialProjectUpdatedAt) {
    const error = new Error(`Video project ${project.id} changed in another editor`);
    error.name = 'StaleVideoProjectSaveError';
    throw error;
  }
  return stored.workspaceRevision;
}

function resetAutosaveRevisionForProject(
  project: VideoProject,
  initialProjectUpdatedAtRef: MutableRefObject<number | null>,
  projectIdRef: MutableRefObject<string | null>,
  revisionRef: MutableRefObject<number | null | undefined>
): void {
  if (projectIdRef.current === project.id) {
    return;
  }
  projectIdRef.current = project.id;
  initialProjectUpdatedAtRef.current = project.updatedAt;
  revisionRef.current = undefined;
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
