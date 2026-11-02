import type { SyncCheckpointReceipt } from '../../../composition/persistence/sync-capture/contracts';
import { createSyncProductClient } from '../../../platform/runtime-messaging/sync-product-client';
import {
  acquireSyncCheckpointEdit,
  type SyncCheckpointEdit,
} from '../../../composition/persistence/sync-capture/checkpoint-publication';
import { useEffect, useRef } from 'react';
import { createAutosaveCoordinator } from '@sniptale/platform/data/autosave';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getVideoProject } from '../../../composition/persistence/projects/index';
import {
  captureVideoProjectHydrationOptions,
  hydrateVideoProject,
} from '../../../features/video/project/hydration';
import { resolveVideoProjectReadResult } from '../../../composition/persistence/projects/contracts';
import { commitVideoProjectWorkspaceMutation } from '../../../composition/persistence/projects/index-mutations';
import type { VideoProject } from '../../../features/video/project/types/index';
import type { VideoEditorLibrariesState } from '../app-model/types';
import type { VideoEditorSessionActions } from '../../contracts/commands/session';
import { replaceVideoEditorUrl } from '../browser-driver';
import { useVideoEditorSaveRetryGeneration } from './save-retry';
import {
  publishVideoEditorSaveReadiness,
  registerVideoEditorSaveBarrier,
  type VideoEditorCheckpointExit,
} from './save-readiness';
import {
  getCurrentVideoEditorProjectSnapshot,
  subscribeVideoEditorProjectHistory,
} from '../controller/store';
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
type CheckpointProtection = {
  ready: Promise<SyncCheckpointEdit>;
  writes: number;
  committed: boolean;
  releasing: boolean;
};
type ProjectContext = {
  checkpointReceipt: SyncCheckpointReceipt | null;
  checkpointProtection: CheckpointProtection | null;
  historyLease: symbol | null;
  retired: boolean;
  retirement: AbortController;
  generation: symbol;
  project: VideoProject;
  savedProject: VideoProject;
  initialHydrationOptions: ReturnType<typeof captureVideoProjectHydrationOptions>;
  canonicalBase: Parameters<typeof commitVideoProjectWorkspaceMutation>[1] | undefined;
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
    const unsubscribeHistory = subscribeVideoEditorProjectHistory(session.historyChanged);
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
      unsubscribeHistory();
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
        checkpointReceipt: null,
        checkpointProtection: null,
        historyLease: null,
        retired: false,
        retirement: new AbortController(),
        generation: Symbol(),
        project,
        savedProject: project,
        initialHydrationOptions: captureVideoProjectHydrationOptions(),
        canonicalBase: undefined,
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

function acknowledgeProjectSave(
  captured: CapturedSave,
  saved: Awaited<ReturnType<typeof commitVideoProjectWorkspaceMutation>>
): void {
  const current = captured.context;
  current.canonicalBase = {
    expectedWorkspaceRevision: saved.workspaceRevision,
    expectedProject: saved.project,
  };
  const receipt = saved.checkpointReceipt;
  current.checkpointReceipt =
    receipt?.rootKind === 'video-project' && receipt.rootId === current.project.id
      ? { ...receipt }
      : null;
  current.savedProject = captured.project;
  current.savedVersion = captured.version;
}

function checkpointProtection(context: ProjectContext): CheckpointProtection {
  if (context.checkpointProtection && !context.checkpointProtection.releasing)
    return context.checkpointProtection;
  const protection: CheckpointProtection = {
    ready: acquireSyncCheckpointEdit(),
    writes: 0,
    committed: false,
    releasing: false,
  };
  context.checkpointProtection = protection;
  void protection.ready.catch(() => {
    if (context.checkpointProtection === protection) context.checkpointProtection = null;
  });
  return protection;
}

function releaseSettledCheckpoint(
  context: ProjectContext,
  protection: CheckpointProtection | null
): void {
  if (
    !protection ||
    protection.releasing ||
    protection.writes > 0 ||
    context.historyLease ||
    (!context.retired && isProjectContextDirty(context))
  )
    return;
  protection.releasing = true;
  void protection.ready
    .then(async (lease) => {
      await lease.release();
      if (protection.committed)
        void createSyncProductClient()
          .wakeCheckpoints()
          .catch(() => undefined);
    })
    .catch(() => undefined)
    .finally(() => {
      if (context.checkpointProtection === protection) context.checkpointProtection = null;
    });
}

function retireCheckpointContext(context: ProjectContext | null): void {
  if (!context) return;
  context.retired = true;
  context.retirement.abort();
  context.historyLease = null;
  releaseSettledCheckpoint(context, context.checkpointProtection);
}

function waitForProjectCommit(context: ProjectContext, finished: Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const refuse = () => reject(new Error('The video project could not be saved.'));
    if (context.retirement.signal.aborted) {
      refuse();
      return;
    }
    context.retirement.signal.addEventListener('abort', refuse, { once: true });
    void finished.then(resolve, reject).finally(() => {
      context.retirement.signal.removeEventListener('abort', refuse);
    });
  });
}

function createVideoEditorAutosave(deps: { persist: typeof persistVideoProject }) {
  let context: ProjectContext | null = null;
  let input: AutosaveInput | null = null;
  let disposed = false;
  let explicit = false;
  let releaseBarrier: (() => void) | null = null;
  let history: { projectId: string | null; lease: symbol | null } = {
    projectId: null,
    lease: null,
  };
  let flushing: { context: ProjectContext; promise: Promise<void> } | null = null;
  let activeCommit: { captured: CapturedSave; finished: Promise<void>; failed: boolean } | null =
    null;
  function publish(saveState: SaveState, updateUi = true) {
    if (!disposed) publishAutosaveReadiness(context, input, saveState, updateUi);
  }
  function protectHistory(current: ProjectContext): void {
    void checkpointProtection(current).ready.catch(() => {
      if (!disposed && context === current) publish('error');
    });
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
      let finish!: () => void;
      const flight = {
        captured,
        finished: new Promise<void>((resolve) => {
          finish = resolve;
        }),
        failed: false,
      };
      activeCommit = flight;
      const protection = checkpointProtection(current);
      protection.writes++;
      publish('saving');
      try {
        await protection.ready;
        if (disposed || context !== current || (!captured.explicit && !input?.enabled)) return;
        const saved = await deps.persist(
          captured,
          () => !disposed && context === current && (captured.explicit || Boolean(input?.enabled))
        );
        if (saved) protection.committed = true;
        if (!saved || disposed || context !== current) return;
        acknowledgeProjectSave(captured, saved);
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
        flight.failed = true;
        if (disposed || context !== current) return;
        current.conflict = error instanceof Error && error.name === 'StaleVideoProjectSaveError';
        if (!current.conflict) logger.error('Failed to save project', error);
        publish(current.conflict ? 'conflict' : 'error');
        throw error;
      } finally {
        protection.writes--;
        releaseSettledCheckpoint(current, protection);
        if (activeCommit === flight) activeCommit = null;
        finish();
      }
    },
    classifyFailure: (error) =>
      error instanceof Error && error.name === 'StaleVideoProjectSaveError' ? 'stop' : 'retry',
  });
  function checkpointExit(turn: ProjectContext): VideoEditorCheckpointExit {
    const receipt = turn.checkpointReceipt;
    const savedProject = turn.savedProject;
    const savedVersion = turn.savedVersion;
    return {
      receipt: receipt ? { ...receipt } : null,
      isCurrent: () =>
        !disposed &&
        context === turn &&
        !turn.retired &&
        !turn.historyLease &&
        getCurrentVideoEditorProjectSnapshot()?.id === turn.project.id &&
        turn.checkpointReceipt === receipt &&
        turn.savedProject === savedProject &&
        turn.savedVersion === savedVersion &&
        !isProjectContextDirty(turn),
    };
  }
  const owner = {
    historyChanged(next: { projectId: string | null; lease: symbol | null }) {
      history = next;
      const current = context;
      if (!current || current.project.id !== next.projectId || current.historyLease === next.lease)
        return;
      current.historyLease = next.lease;
      if (next.lease) protectHistory(current);
      else {
        const project = getCurrentVideoEditorProjectSnapshot();
        if (input && project?.id === current.project.id) owner.update({ ...input, project });
        if (input?.enabled) void owner.flushLatest().catch(() => undefined);
        releaseSettledCheckpoint(current, current.checkpointProtection);
      }
    },
    update(next: AutosaveInput) {
      input = next;
      const project = next.project;
      if (!project || context?.project.id !== project.id) {
        retireCheckpointContext(context);
        releaseBarrier?.();
        releaseBarrier = null;
        if (!project) publish('error', false);
        coordinator.cancel('document');
        coordinator.resume();
        context = createProjectContext(project);
        if (context && history.projectId === project?.id && history.lease) {
          context.historyLease = history.lease;
          protectHistory(context);
        }
        publish('saved');
        if (context) {
          const registered = context;
          releaseBarrier = registerVideoEditorSaveBarrier(
            registered.project.id,
            registered.generation,
            () => owner.flushLatest(),
            () => checkpointExit(registered)
          );
        }
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
        releaseSettledCheckpoint(context, context.checkpointProtection);
        return;
      }
      context.revisionSync = null;
      if (project !== context.project) {
        context.project = project;
        context.requestedVersion += 1;
      }
      if (project === context.savedProject) {
        publish('saved');
        releaseSettledCheckpoint(context, context.checkpointProtection);
        return;
      }
      publish('dirty');
      if (next.enabled) coordinator.request('document', EDITOR_AUTOSAVE_POLICY);
      else coordinator.cancel('document');
    },
    isDirty: () => isProjectContextDirty(context),
    isEnabled: () => Boolean(input?.enabled),
    flushLatest(): Promise<void> {
      const turn = context;
      if (!turn || !input || disposed)
        return Promise.reject(new Error('The open video project changed.'));
      if (flushing?.context === turn) return flushing.promise;
      const promise = (async () => {
        while (context === turn) {
          if (!input) throw new Error('The open video project changed.');
          const project = getCurrentVideoEditorProjectSnapshot();
          if (!project || project.id !== turn.project.id)
            throw new Error('The open video project changed.');
          owner.update({ ...input, project });
          if (turn.conflict) throw new Error('The video project has unsaved changes.');
          if (turn.project === turn.savedProject) return;
          const version = turn.requestedVersion;
          const running = activeCommit;
          if (running?.captured.context === turn && running.captured.version >= version) {
            await waitForProjectCommit(turn, running.finished);
            if (running.failed) throw new Error('The video project could not be saved.');
            continue;
          }
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
      })();
      const barrier = { context: turn, promise };
      flushing = barrier;
      void promise
        .finally(() => {
          if (flushing === barrier) flushing = null;
        })
        .catch(() => undefined);
      return promise;
    },
    dispose() {
      retireCheckpointContext(context);
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
  const base =
    context.canonicalBase ??
    (await resolveInitialWorkspaceBase(context.savedProject, context.initialHydrationOptions));
  if (!isCurrent()) return null;
  return commitVideoProjectWorkspaceMutation(project, base);
}

async function resolveInitialWorkspaceBase(
  project: VideoProject,
  hydration: ReturnType<typeof captureVideoProjectHydrationOptions>
): Promise<Parameters<typeof commitVideoProjectWorkspaceMutation>[1]> {
  const stored = await getVideoProject(project.id);
  const storedProject = resolveVideoProjectReadResult(stored);
  if (
    stored.status !== 'ready' ||
    stored.lifecycle?.trashedAt !== undefined ||
    !storedProject ||
    JSON.stringify(hydrateVideoProject(storedProject, hydration)) !==
      JSON.stringify(hydrateVideoProject(project, hydration))
  ) {
    const error = new Error(`Video project ${project.id} changed in another editor`);
    error.name = 'StaleVideoProjectSaveError';
    throw error;
  }
  return { expectedWorkspaceRevision: stored.workspaceRevision, expectedProject: storedProject };
}
