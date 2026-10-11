import type { ScenarioProjectSnapshot } from '../../../composition/persistence/scenario/contracts';
import { useEffect, useRef } from 'react';
import { createAutosaveCoordinator } from '@sniptale/platform/data/autosave';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { saveScenarioProjectRecord } from '../../../composition/persistence/scenario/store/public';

export const GUIDE_AUTOSAVE_IDLE_MS = 1500;
export const GUIDE_AUTOSAVE_MAX_WAIT_MS = 5000;

type SaveStatus = 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict';
type AutosaveInput = {
  project: GuideProject | null;
  dirty: boolean;
  enabled?: boolean;
  conflict: boolean;
  protectUnsaved: boolean;
  saved: { current: ScenarioProjectSnapshot | null };
  busy: { current: boolean };
  autosaving: { current: boolean };
  generation: { current: number };
  onStatus: (status: SaveStatus) => void;
  onPublish: (project: GuideProject, source: GuideProject) => void;
};
type Session = {
  generation: number;
  projectId: string | undefined;
  acknowledgement?: { source: GuideProject; committed: ScenarioProjectSnapshot };
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
      if (state.dirty && state.enabled !== false) void owner.current?.flushLatest();
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
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
    capture: () => ({ session: getSession(), args: latest() }),
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
      };
      observed = undefined;
    }
    return session;
  }
  function execute(capture: Capture): Promise<boolean> {
    const operation = persistGuideDraft(
      capture,
      () => current(capture.session),
      () => latest().project
    ).finally(() => {
      if (pending === operation) pending = null;
    });
    pending = operation;
    return operation;
  }
  function save(): Promise<boolean> {
    if (pending) return pending.catch(() => false);
    const capture = { session: getSession(), args: latest() };
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
    save,
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
            (source === turn.acknowledgement?.source && base === turn.acknowledgement.committed) ||
            guideDraftContent(source) === guideDraftContent(base.project)
          ) {
            args.onStatus('saved');
            return base.project;
          }
          if (!(await save())) return null;
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

/** Owns one admitted scenario write, its committed revision and admission cleanup. */
function persistGuideDraft(
  { session: turn, args }: Capture,
  isCurrent: () => boolean,
  currentProject: () => GuideProject | null
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
    args.onStatus('saved');
    return Promise.resolve(true);
  }
  args.busy.current = true;
  args.autosaving.current = true;
  args.onStatus('saving');
  return saveScenarioProjectRecord(source, { expectedRevision: base.workspaceRevision })
    .then((committed) => {
      if (!isCurrent()) return false;
      turn.acknowledgement = { source, committed };
      args.saved.current = committed;
      args.onPublish(committed.project, source);
      args.onStatus(currentProject() === source ? 'saved' : 'dirty');
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

/** Persistence reorders object keys; only the aggregate timestamp is outside draft content. */
function guideDraftContent(project: GuideProject): string {
  return JSON.stringify({ ...project, updatedAt: 0 }, (_key, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        )
      : value
  );
}
