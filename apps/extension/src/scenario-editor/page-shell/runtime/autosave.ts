import { guideProjectContentIdentity as guideDraftContent } from './content-identity';
import type { ScenarioProjectSnapshot } from '../../../composition/persistence/scenario/contracts';
import { useEffect, useRef } from 'react';
import { createAutosaveCoordinator } from '@sniptale/platform/data/autosave';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { saveScenarioProjectRecord } from '../../../composition/persistence/scenario/store/public';
import type { GuideHistoryCapture } from './history';
import { EDITOR_AUTOSAVE_POLICY } from '../../../features/autosave/policy';

export const GUIDE_AUTOSAVE_IDLE_MS = EDITOR_AUTOSAVE_POLICY.delay;
export const GUIDE_AUTOSAVE_MAX_WAIT_MS = EDITOR_AUTOSAVE_POLICY.maxWait;

type SaveStatus = 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict';
type AutosaveInput = {
  project: GuideProject | null;
  actionId?: string | undefined;
  closedCaptures?: readonly GuideHistoryCapture[];
  onSealEdit?(): void;
  dirty: boolean;
  enabled?: boolean;
  conflict: boolean;
  protectUnsaved: boolean;
  saved: { current: ScenarioProjectSnapshot | null };
  busy: { current: boolean };
  autosaving: { current: boolean };
  generation: { current: number };
  onStatus: (status: SaveStatus) => void;
  onPublish: (project: GuideProject, source: GuideProject, actionId?: string) => void;
};
type Session = {
  generation: number;
  projectId: string | undefined;
  acknowledgement?: { source: GuideProject; committed: ScenarioProjectSnapshot };
  acknowledgedActions: WeakMap<GuideProject, Set<string>>;
  conflict: boolean;
};
type Capture = { session: Session; args: AutosaveInput };

/** Schedules writes through the page's shared admission gate and committed revision. */
export function useGuideAutosave(input: AutosaveInput) {
  const latest = useRef(input);
  latest.current = input;
  const owner = useRef<ReturnType<typeof createGuideAutosave> | null>(null);
  useEffect(() => {
    const session = createGuideAutosave(() => latest.current);
    owner.current = session;
    return () => {
      session.dispose();
      if (owner.current === session) owner.current = null;
    };
  }, []);
  useEffect(() => owner.current?.update());
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      const state = latest.current;
      if (!state.project) return;
      if (!state.protectUnsaved && !state.autosaving.current) return;
      const committed = state.saved.current?.project;
      if (
        committed &&
        !state.autosaving.current &&
        (state.project === committed ||
          guideDraftContent(state.project) === guideDraftContent(committed))
      )
        return;
      event.preventDefault();
      event.returnValue = '';
    };
    const flush = () => {
      if (latest.current.enabled !== false) void owner.current?.flushLatest();
    };
    const visibility = () => flush();
    window.addEventListener('beforeunload', protect);
    window.addEventListener('pagehide', flush);
    window.addEventListener('pageshow', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('beforeunload', protect);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('pageshow', flush);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return {
    save: () => owner.current?.save() ?? Promise.resolve(false),
    flushLatest: () => owner.current?.flushLatest() ?? Promise.resolve(null),
    flushEdits: () => {
      if (latest.current.enabled !== false && latest.current.dirty)
        void owner.current?.flushLatest();
    },
  };
}

function createGuideAutosave(latest: () => AutosaveInput) {
  let disposed = false;
  let session: Session | undefined;
  let observed: AutosaveInput | undefined;
  let pending: Promise<boolean> | null = null;
  const current = (turn: Session) =>
    !disposed &&
    session === turn &&
    latest().generation.current === turn.generation &&
    latest().project?.id === turn.projectId;
  const coordinator = createAutosaveCoordinator<'document', Capture>({
    now: Date.now,
    schedule(callback, delay) {
      const timer = window.setTimeout(callback, delay);
      return () => window.clearTimeout(timer);
    },
    capture: () => captureLatest(),
    commit: async (capture) => {
      if (capture.args.enabled === false || !current(capture.session)) return;
      await execute(capture);
    },
    classifyFailure: (error) => (isConflict(error) ? 'stop' : 'retry'),
  });
  function getSession() {
    const args = latest();
    if (
      !session ||
      session.generation !== args.generation.current ||
      session.projectId !== args.project?.id
    ) {
      coordinator.cancel('document');
      coordinator.resume();
      session = {
        generation: args.generation.current,
        projectId: args.project?.id,
        conflict: false,
        acknowledgedActions: new WeakMap(),
      };
      observed = undefined;
    }
    return session;
  }
  function execute(capture: Capture): Promise<boolean> {
    const operation = persistCapture(capture).finally(() => {
      if (pending === operation) pending = null;
    });
    pending = operation;
    return operation;
  }
  function captureLatest(): Capture {
    const args = latest();
    return {
      session: getSession(),
      args: {
        ...args,
        ...(args.closedCaptures ? { closedCaptures: [...args.closedCaptures] } : {}),
      },
    };
  }
  function persistCapture(capture: Capture): Promise<boolean> {
    return persistGuideCaptures(
      capture,
      () => current(capture.session),
      () => latest().project
    );
  }
  function saveCaptured(capture = captureLatest()): Promise<boolean> {
    coordinator.cancel('document');
    return coordinator
      .runOrdered(() => execute(capture))
      .catch((error: unknown) => {
        if (current(capture.session) && isConflict(error)) coordinator.suspend(error);
        return false;
      });
  }
  return {
    update() {
      const turn = getSession();
      const args = latest();
      const previous = observed;
      observed = args;
      if (args.conflict || turn.conflict) {
        coordinator.suspend(new Error('Scenario save has a revision conflict.'));
        return;
      }
      if (!args.project || args.enabled === false || (!args.dirty && !args.autosaving.current)) {
        coordinator.cancel('document');
        return;
      }
      if (!args.dirty) return;
      const changed =
        previous?.project !== args.project && !isTimestampRebase(previous?.project, args.project);
      if (!previous || changed || previous.enabled === false || !previous.dirty)
        coordinator.request('document', {
          delay: GUIDE_AUTOSAVE_IDLE_MS,
          maxWait: GUIDE_AUTOSAVE_MAX_WAIT_MS,
        });
    },
    save() {
      const capture = captureLatest();
      capture.args.onSealEdit?.();
      return saveCaptured(capture);
    },
    async flushLatest(): Promise<GuideProject | null> {
      const turn = getSession();
      try {
        while (current(turn)) {
          if (pending) {
            if (!(await pending)) return null;
            continue;
          }
          const args = latest();
          const source = args.project;
          const base = args.saved.current;
          if (!source || !base || source.id !== base.project.id || args.conflict || turn.conflict)
            return null;
          if (
            !(args.closedCaptures ?? []).some(
              (group) => !guideActionAcknowledged(turn, group.project, group.actionId)
            ) &&
            ((source === turn.acknowledgement?.source && base === turn.acknowledgement.committed) ||
              guideDraftContent(source) === guideDraftContent(base.project))
          ) {
            args.onStatus('saved');
            return base.project;
          }
          if (!(await saveCaptured())) return null;
        }
      } catch {
        return null;
      }
      return null;
    },
    dispose() {
      disposed = true;
      coordinator.dispose();
    },
  };
}

function guideActionAcknowledged(turn: Session, project: GuideProject, actionId: string): boolean {
  return turn.acknowledgedActions.get(project)?.has(actionId) === true;
}

function acknowledgeGuideAction(turn: Session, project: GuideProject, actionId?: string): void {
  if (!actionId) return;
  const ids = turn.acknowledgedActions.get(project) ?? new Set<string>();
  ids.add(actionId);
  turn.acknowledgedActions.set(project, ids);
}

/** Drains closed user actions without waiting for React to remove their rendered captures. */
async function persistGuideCaptures(
  capture: Capture,
  isCurrent: () => boolean,
  currentProject: () => GuideProject | null
): Promise<boolean> {
  const closed = capture.args.closedCaptures ?? [];
  const closedIsCurrent =
    closed.at(-1)?.actionId === capture.args.actionId && capture.args.actionId !== undefined;
  for (const [index, group] of closed.entries()) {
    if (guideActionAcknowledged(capture.session, group.project, group.actionId)) continue;
    if (
      !(await persistGuideDraft(
        {
          session: capture.session,
          args: { ...capture.args, project: group.project, actionId: group.actionId },
        },
        isCurrent,
        currentProject,
        closedIsCurrent && index === closed.length - 1
      ))
    )
      return false;
  }
  if (closedIsCurrent) return true;
  return persistGuideDraft(capture, isCurrent, currentProject);
}

/** Owns one admitted scenario write, its committed revision and admission cleanup. */
function persistGuideDraft(
  { session: turn, args }: Capture,
  isCurrent: () => boolean,
  currentProject: () => GuideProject | null,
  isFinalCapture = true
): Promise<boolean> {
  const source = args.project;
  const base = args.saved.current;
  if (!isCurrent()) return Promise.resolve(false);
  if (
    !source ||
    !base ||
    source.id !== base.project.id ||
    args.conflict ||
    turn.conflict ||
    args.busy.current
  )
    return Promise.reject(new Error('Scenario save admission is unavailable.'));
  if (source === base.project || guideDraftContent(source) === guideDraftContent(base.project)) {
    acknowledgeGuideAction(turn, source, args.actionId);
    if (args.actionId) args.onPublish(base.project, source, args.actionId);
    args.onStatus(isFinalCapture ? 'saved' : 'saving');
    return Promise.resolve(true);
  }
  args.busy.current = true;
  args.autosaving.current = true;
  args.onStatus('saving');
  return saveScenarioProjectRecord(source, {
    expectedRevision: base.workspaceRevision,
    ...(args.actionId ? { historyActionId: args.actionId } : {}),
  })
    .then((committed) => {
      if (!isCurrent()) return false;
      turn.acknowledgement = { source, committed };
      acknowledgeGuideAction(turn, source, args.actionId);
      args.saved.current = committed;
      if (args.actionId) args.onPublish(committed.project, source, args.actionId);
      else args.onPublish(committed.project, source);
      const current = currentProject();
      args.onStatus(
        !isFinalCapture
          ? 'saving'
          : current === source || (current && isTimestampRebase(source, current))
            ? 'saved'
            : 'dirty'
      );
      return true;
    })
    .catch((error: unknown) => {
      if (!isCurrent()) return false;
      turn.conflict = isConflict(error);
      args.onStatus(turn.conflict ? 'conflict' : 'failed');
      throw error;
    })
    .finally(() => {
      args.busy.current = false;
      args.autosaving.current = false;
    });
}

function isConflict(error: unknown): boolean {
  return error instanceof Error && error.name === 'StaleScenarioAggregateRevisionError';
}

/** History publication changes only the timestamp of a newer draft. */
function isTimestampRebase(previous: GuideProject | null | undefined, next: GuideProject): boolean {
  return (
    !!previous &&
    Object.keys(previous).length === Object.keys(next).length &&
    Object.entries(previous).every(
      ([key, value]) => key === 'updatedAt' || Reflect.get(next, key) === value
    )
  );
}
