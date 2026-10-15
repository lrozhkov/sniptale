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
import { publishVideoEditorSaveReadiness, registerVideoEditorSaveBarrier } from './save-readiness';
import { getCurrentVideoEditorProjectSnapshot } from '../controller/store';
import { EDITOR_AUTOSAVE_POLICY } from '../../../features/autosave/policy';

const logger = createLogger({ namespace: 'VideoEditorAutoSave' });
type SaveState = Parameters<VideoEditorSessionActions['setSaveState']>[0];
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
  explicit: boolean;
};

/** Coalesces uncaptured project edits through the product's document-save policy. */
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
    const flush = () => {
      if (!session.isEnabled()) return;
      void session.flushLatest().catch(() => undefined);
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('pageshow', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('beforeunload', protect);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('pageshow', flush);
      document.removeEventListener('visibilitychange', flush);
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

function publishAutosaveReadiness(
  context: ProjectContext | null,
  input: AutosaveInput | null,
  saveState: SaveState,
  updateUi: boolean
) {
  if (!context || !input) return;
  if (updateUi) input.setSaveState(saveState);
  publishVideoEditorSaveReadiness({
    projectId: context.project.id,
    saveState,
    generation: context.generation,
    requestedVersion: context.requestedVersion,
    savedVersion: context.savedVersion,
  });
}

function createProjectContext(project: VideoProject | null): ProjectContext | null {
  return project
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
}

function isProjectContextDirty(context: ProjectContext | null) {
  const project = getCurrentVideoEditorProjectSnapshot();
  return Boolean(
    context &&
    (project?.id === context.project.id ? project : context.project) !== context.savedProject
  );
}

function isSyncedProjectRevision(project: VideoProject, synced: ProjectContext['revisionSync']) {
  return Boolean(
    synced &&
    project.updatedAt === synced.revision &&
    Object.entries(synced.project).every(
      ([key, value]) => key === 'updatedAt' || Reflect.get(project, key) === value
    )
  );
}

function scheduleDocumentAutosave(callback: () => void, delay: number) {
  const timer = window.setTimeout(callback, delay);
  return () => window.clearTimeout(timer);
}

function createVideoEditorAutosave(deps: { persist: typeof persistVideoProject }) {
  let context: ProjectContext | null = null;
  let input: AutosaveInput | null = null;
  let disposed = false;
  let explicit = false;
  let releaseBarrier: (() => void) | null = null;
  function publish(saveState: SaveState, updateUi = true) {
    if (!disposed) publishAutosaveReadiness(context, input, saveState, updateUi);
  }
  const coordinator = createAutosaveCoordinator<'document', CapturedSave>({
    now: () => Date.now(),
    schedule: scheduleDocumentAutosave,
    capture: () => {
      if (!context || !input) throw new Error('The open video project changed.');
      return {
        context,
        input,
        project: context.project,
        version: context.requestedVersion,
        explicit,
      };
    },
    commit: async (captured) => {
      const current = captured.context;
      publish('saving');
      try {
        const saved = await deps.persist(
          captured,
          () => !disposed && context === current && (captured.explicit || Boolean(input?.enabled))
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
  const owner = {
    update(next: AutosaveInput) {
      input = next;
      const project = next.project;
      if (!project || context?.project.id !== project.id) {
        releaseBarrier?.();
        releaseBarrier = null;
        if (!project) publish('error', false);
        coordinator.cancel('document');
        coordinator.resume();
        context = createProjectContext(project);
        publish('saved');
        if (context)
          releaseBarrier = registerVideoEditorSaveBarrier(
            context.project.id,
            context.generation,
            () => owner.flushLatest()
          );
        return;
      }
      if (context.conflict) {
        publish('conflict');
        return;
      }
      const synced = context.revisionSync;
      if (isSyncedProjectRevision(project, synced)) {
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
      if (next.enabled) coordinator.request('document', EDITOR_AUTOSAVE_POLICY);
      else coordinator.cancel('document');
    },
    isDirty: () => isProjectContextDirty(context),
    isEnabled: () => Boolean(input?.enabled),
    async flushLatest(): Promise<void> {
      const turn = context;
      if (!turn || !input || disposed) throw new Error('The open video project changed.');
      while (context === turn) {
        const project = getCurrentVideoEditorProjectSnapshot();
        if (!project || project.id !== turn.project.id)
          throw new Error('The open video project changed.');
        owner.update({ ...input, project });
        if (turn.conflict) throw new Error('The video project has unsaved changes.');
        if (turn.project === turn.savedProject) return;
        const version = turn.requestedVersion;
        explicit = true;
        try {
          coordinator.request('document', EDITOR_AUTOSAVE_POLICY);
          await coordinator.flushCaptured(['document']);
        } catch (cause) {
          throw new Error('The video project could not be saved.', { cause });
        } finally {
          explicit = false;
        }
        if (disposed || context !== turn || turn.savedVersion < version)
          throw new Error('The video project could not be saved.');
      }
      throw new Error('The open video project changed.');
    },
    dispose() {
      releaseBarrier?.();
      releaseBarrier = null;
      publish('error', false);
      coordinator.dispose();
      disposed = true;
    },
  };
  return owner;
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
