import { useEffect, useRef } from 'react';
import { createAutosaveCoordinator } from '@sniptale/platform/data/autosave';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getVideoProject } from '../../../composition/persistence/projects/index';
import { resolveVideoProjectReadResult } from '../../../composition/persistence/projects/contracts';
import { commitVideoProjectWorkspaceMutation } from '../../../composition/persistence/projects/index-mutations';
import type { VideoProject } from '../../../features/video/project/types/index';
import type { VideoEditorLibrariesState } from '../app-model/types';
import type { VideoEditorSessionActions } from '../../contracts/commands/session';
import { replaceVideoEditorUrl } from '../browser-driver';
import { useVideoEditorSaveRetryGeneration } from './save-retry';
import { publishVideoEditorSaveReadiness } from './save-readiness';

const logger = createLogger({ namespace: 'VideoEditorAutoSave' });
type AutosaveInput = {
  project: VideoProject | null;
  recordingId: string | null;
  enabled: boolean;
  setSaveState: VideoEditorSessionActions['setSaveState'];
  refreshProjects: VideoEditorLibrariesState['refreshProjects'];
  syncProjectRevision?: VideoEditorSessionActions['syncProjectRevision'];
};
type ProjectContext = {
  generation: symbol;
  project: VideoProject;
  savedProject: VideoProject;
  initialUpdatedAt: number;
  workspaceRevision: number | null | undefined;
  requestedVersion: number;
  savedVersion: number;
  conflict: boolean;
  revisionSync: { project: VideoProject; revision: number } | null;
};
type CapturedSave = {
  context: ProjectContext;
  input: AutosaveInput;
  project: VideoProject;
  version: number;
};

/** Coalesces uncaptured project edits while preserving the editor's 350ms idle policy. */
export function useVideoEditorAutoSave(
  project: VideoProject | null,
  recordingId: string | null,
  setSaveState: VideoEditorSessionActions['setSaveState'],
  refreshProjects: VideoEditorLibrariesState['refreshProjects'],
  syncProjectRevision?: VideoEditorSessionActions['syncProjectRevision'],
  enabled = true
): void {
  const owner = useRef<ReturnType<typeof createVideoEditorAutosave> | null>(null);
  const retryGeneration = useVideoEditorSaveRetryGeneration();
  useEffect(() => {
    const session = createVideoEditorAutosave({ persist: persistVideoProject });
    owner.current = session;
    const protect = (event: BeforeUnloadEvent) => {
      if (!session.isDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => {
      window.removeEventListener('beforeunload', protect);
      session.dispose();
      owner.current = null;
    };
  }, []);
  useEffect(() => {
    owner.current?.update({
      project,
      recordingId,
      setSaveState,
      refreshProjects,
      enabled,
      ...(syncProjectRevision ? { syncProjectRevision } : {}),
    });
  }, [
    project,
    recordingId,
    setSaveState,
    refreshProjects,
    syncProjectRevision,
    enabled,
    retryGeneration,
  ]);
}

function createVideoEditorAutosave(deps: { persist: typeof persistVideoProject }) {
  let context: ProjectContext | null = null;
  let input: AutosaveInput | null = null;
  let disposed = false;
  function publish(
    saveState: Parameters<VideoEditorSessionActions['setSaveState']>[0],
    updateUi = true
  ) {
    if (!context || !input || disposed) return;
    if (updateUi) input.setSaveState(saveState);
    publishVideoEditorSaveReadiness({
      projectId: context.project.id,
      saveState,
      generation: context.generation,
      requestedVersion: context.requestedVersion,
      savedVersion: context.savedVersion,
    });
  }
  const coordinator = createAutosaveCoordinator<'document', CapturedSave>({
    now: () => Date.now(),
    schedule: (callback, delay) => {
      const timer = window.setTimeout(callback, delay);
      return () => window.clearTimeout(timer);
    },
    capture: () => {
      if (!context || !input) throw new Error('The open video project changed.');
      return {
        context,
        input,
        project: context.project,
        version: context.requestedVersion,
      };
    },
    commit: async (captured) => {
      const current = captured.context;
      publish('saving');
      try {
        const saved = await deps.persist(
          captured,
          () => !disposed && context === current && Boolean(input?.enabled)
        );
        if (!saved || disposed || context !== current) return;
        current.workspaceRevision = saved.workspaceRevision;
        current.savedProject = captured.project;
        current.savedVersion = captured.version;
        if (current.requestedVersion === captured.version && input?.enabled) {
          const sync = captured.input.syncProjectRevision;
          if (sync && saved.project.updatedAt !== current.savedProject.updatedAt) {
            current.revisionSync = {
              project: current.savedProject,
              revision: saved.project.updatedAt,
            };
            sync(current.savedProject, saved.project.updatedAt);
          }
          publish('saved');
          replaceVideoEditorUrl(saved.project.id, captured.input.recordingId);
          void captured.input.refreshProjects();
        } else publish('dirty');
      } catch (error) {
        if (disposed || context !== current) return;
        current.conflict = error instanceof Error && error.name === 'StaleVideoProjectSaveError';
        if (!current.conflict) logger.error('Failed to save project', error);
        publish(current.conflict ? 'conflict' : 'error');
        throw error;
      }
    },
    classifyFailure: (error) =>
      error instanceof Error && error.name === 'StaleVideoProjectSaveError' ? 'stop' : 'retry',
  });
  return {
    update(next: AutosaveInput) {
      input = next;
      const project = next.project;
      if (!project || context?.project.id !== project.id) {
        if (!project) publish('error', false);
        coordinator.cancel('document');
        coordinator.resume();
        context = project
          ? {
              generation: Symbol(),
              project,
              savedProject: project,
              initialUpdatedAt: project.updatedAt,
              workspaceRevision: undefined,
              requestedVersion: 0,
              savedVersion: 0,
              conflict: false,
              revisionSync: null,
            }
          : null;
        publish('saved');
        return;
      }
      if (context.conflict) {
        publish('conflict');
        return;
      }
      const synced = context.revisionSync;
      if (
        synced &&
        project.updatedAt === synced.revision &&
        Object.entries(synced.project).every(
          ([key, value]) => key === 'updatedAt' || Reflect.get(project, key) === value
        )
      ) {
        context.revisionSync = null;
        context.project = project;
        context.savedProject = project;
        publish('saved');
        return;
      }
      context.revisionSync = null;
      if (project !== context.project) {
        context.project = project;
        context.requestedVersion += 1;
      }
      if (project === context.savedProject) {
        publish('saved');
        return;
      }
      publish('dirty');
      if (next.enabled) coordinator.request('document', { delay: 350 });
      else coordinator.cancel('document');
    },
    isDirty: () => Boolean(context && context.project !== context.savedProject),
    dispose() {
      publish('error', false);
      coordinator.dispose();
      disposed = true;
    },
  };
}

async function persistVideoProject(
  captured: CapturedSave,
  isCurrent: () => boolean
): Promise<Awaited<ReturnType<typeof commitVideoProjectWorkspaceMutation>> | null> {
  const project = captured.project;
  if (!isCurrent()) return null;
  const context = captured.context;
  const expectedWorkspaceRevision =
    context.workspaceRevision === undefined
      ? await resolveInitialWorkspaceRevision(project, context.initialUpdatedAt)
      : context.workspaceRevision;
  if (!isCurrent()) return null;
  return commitVideoProjectWorkspaceMutation(project, { expectedWorkspaceRevision });
}

async function resolveInitialWorkspaceRevision(
  project: VideoProject,
  initialProjectUpdatedAt: number | null
): Promise<number | null> {
  const stored = await getVideoProject(project.id);
  if (stored.status === 'notFound') return null;
  if (stored.status !== 'ready') throw new Error(`Video project ${project.id} is unavailable`);
  const storedProject = resolveVideoProjectReadResult(stored);
  if (!storedProject || storedProject.updatedAt !== initialProjectUpdatedAt) {
    const error = new Error(`Video project ${project.id} changed in another editor`);
    error.name = 'StaleVideoProjectSaveError';
    throw error;
  }
  return stored.workspaceRevision;
}
