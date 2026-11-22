import { parseSyncCheckpointReceipt } from '../../../composition/persistence/sync-capture/guards';
import type { SyncCheckpointReceipt } from '../../../composition/persistence/sync-capture/contracts';
import { createSyncProductClient } from '../../../platform/runtime-messaging/sync-product-client';
import { guideProjectContentIdentity as guideDraftContent } from './content-identity';
import type {
  ScenarioProjectSnapshot,
  ScenarioEditingHistory,
} from '../../../composition/persistence/scenario/contracts';
import { useEffect, useRef } from 'react';
import { createAutosaveCoordinator } from '@sniptale/platform/data/autosave';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { saveScenarioProjectRecord } from '../../../composition/persistence/scenario/store/public';
import {
  acquireSyncCheckpointEdit,
  type SyncCheckpointEdit,
} from '../../../composition/persistence/sync-capture/checkpoint-publication';
import { EDITOR_AUTOSAVE_POLICY } from '../../../features/autosave/policy';

export const GUIDE_AUTOSAVE_IDLE_MS = EDITOR_AUTOSAVE_POLICY.delay;
export const GUIDE_AUTOSAVE_MAX_WAIT_MS = EDITOR_AUTOSAVE_POLICY.maxWait;

/** A transient receipt and document guard for one awaited normal-exit intent. */
interface GuideCheckpointExit {
  readonly receipt: SyncCheckpointReceipt | null;
  isCurrent(): boolean;
}

type SaveStatus = 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict';
type AutosaveInput = {
  project: GuideProject | null;
  actionId?: string | undefined;
  editingHistory?: ScenarioEditingHistory;
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
  acknowledgement?: {
    source: GuideProject;
    editingHistory?: ScenarioEditingHistory;
    committed: ScenarioProjectSnapshot;
    checkpointReceipt: SyncCheckpointReceipt | null;
  };
  conflict: boolean;
  publication?: Promise<SyncCheckpointEdit>;
  publicationCommitted?: boolean;
  revision: number;
  finishAt: number;
  write?: Promise<boolean>;
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
        !owner.current?.hasUnpublishedHistory() &&
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
    const endPointer = (event: PointerEvent) => owner.current?.endInteraction(event.pointerId);
    window.addEventListener('pointerup', endPointer, true);
    window.addEventListener('pointercancel', endPointer, true);
    window.addEventListener('lostpointercapture', endPointer, true);
    window.addEventListener('beforeunload', protect);
    window.addEventListener('pagehide', flush);
    window.addEventListener('pageshow', flush);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointerup', endPointer, true);
      window.removeEventListener('pointercancel', endPointer, true);
      window.removeEventListener('lostpointercapture', endPointer, true);
      window.removeEventListener('beforeunload', protect);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('pageshow', flush);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return {
    beginEdit: () => owner.current?.beginEdit(),
    beginInteraction: (pointerId: number) => owner.current?.beginInteraction(pointerId),
    endInteraction: (pointerId: number) => owner.current?.endInteraction(pointerId),
    save: () => owner.current?.save() ?? Promise.resolve(false),
    flushLatest: () => owner.current?.flushLatest() ?? Promise.resolve(null),
    prepareCheckpointExit: () => owner.current?.prepareCheckpointExit() ?? Promise.resolve(null),
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
  const pointers = new Map<number, { turn: Session; revision: number }>();
  let finishTimer: number | undefined;
  let observedRevision = 0;
  let pointerStartEpoch = 0;
  const cancelFinish = () => {
    if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    finishTimer = undefined;
  };
  async function releasePublication(turn: Session) {
    const publication = turn.publication;
    const committed = turn.publicationCommitted;
    delete turn.publication;
    turn.publicationCommitted = false;
    if (publication)
      await publication
        .then(async (lease) => {
          await lease.release();
          if (committed)
            void createSyncProductClient()
              .wakeCheckpoints()
              .catch(() => undefined);
        })
        .catch(() => undefined);
  }
  function retire(turn: Session | undefined) {
    if (turn)
      void Promise.resolve(turn.write)
        .catch(() => undefined)
        .then(() => releasePublication(turn));
  }
  function acquirePublication(turn: Session) {
    if (!turn.publication) {
      const publication = acquireSyncCheckpointEdit().catch((error: unknown) => {
        if (turn.publication === publication) delete turn.publication;
        if (current(turn)) latest().onStatus('failed');
        throw error;
      });
      turn.publication = publication;
      void publication.catch(() => undefined);
    }
    return turn.publication;
  }
  function beginEdit() {
    const turn = getSession();
    turn.revision += 1;
    void acquirePublication(turn);
    scheduleFinish(turn);
  }
  async function finishPublication(turn: Session, revision: number) {
    if (current(turn) && turn.revision === revision && !pointers.size)
      await releasePublication(turn);
  }
  function scheduleFinish(turn: Session) {
    cancelFinish();
    turn.finishAt = Date.now() + GUIDE_AUTOSAVE_IDLE_MS;
    if (latest().enabled !== false)
      finishTimer = window.setTimeout(() => {
        finishTimer = undefined;
        void settleIdle(turn, turn.revision);
      }, GUIDE_AUTOSAVE_IDLE_MS);
  }
  async function settleIdle(turn: Session, revision: number) {
    try {
      if (turn.write && !(await turn.write)) return;
      await releaseAcknowledged(turn, revision);
    } catch {
      /* The failed native writer retains publication protection for retry. */
    }
  }
  async function releaseAcknowledged(turn: Session, revision: number, explicit = false) {
    if (!current(turn) || (!explicit && latest().enabled === false)) return;
    const args = latest();
    const source = args.project;
    const base = args.saved.current;
    if (!source || !base || source.id !== base.project.id) return;
    if (!guideHistoryAcknowledged(turn, args)) return;
    if (guideDraftContent(source) === guideDraftContent(base.project))
      await finishPublication(turn, revision);
  }
  async function completeEdit() {
    const turn = getSession();
    const revision = turn.revision;
    if (pointers.size || latest().enabled === false) return;
    if (await flushLatest(revision)) await finishPublication(turn, revision);
  }
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
      cancelFinish();
      retire(session);
      session = {
        generation: args.generation.current,
        projectId: args.project?.id,
        conflict: false,
        revision: 0,
        finishAt: 0,
      };
      observed = undefined;
      observedRevision = 0;
    }
    return session;
  }
  function execute(capture: Capture): Promise<boolean> {
    const revision = capture.session.revision;
    const operation = persistCapture(capture)
      .then(async (saved) => {
        if (saved && Date.now() >= capture.session.finishAt)
          await releaseAcknowledged(capture.session, revision);
        return saved;
      })
      .finally(() => {
        if (pending === operation) pending = null;
      });
    pending = operation;
    capture.session.write = operation;
    return operation;
  }
  function captureLatest(): Capture {
    const args = latest();
    return {
      session: getSession(),
      args: {
        ...args,
      },
    };
  }
  async function persistCapture(capture: Capture): Promise<boolean> {
    if (!current(capture.session)) return false;
    await acquirePublication(capture.session);
    if (!current(capture.session)) {
      await releasePublication(capture.session);
      return false;
    }
    return persistGuideDraft(
      capture,
      () => current(capture.session),
      () => latest()
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
  async function flushLatest(revision?: number): Promise<GuideProject | null> {
    const turn = getSession();
    try {
      while (current(turn)) {
        if (revision !== undefined && turn.revision !== revision) return null;
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
          guideHistoryAcknowledged(turn, args) &&
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
  }
  async function prepareCheckpointExit(): Promise<GuideCheckpointExit | null> {
    const turn = getSession();
    const pointerEpoch = pointerStartEpoch;
    const revision = turn.revision;
    const source = latest().project;
    if (!source) return null;
    const content = guideDraftContent(source);
    // A navigation click can run before endInteraction's pointerup cleanup task.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    const afterDispatch = latest().project;
    if (
      !current(turn) ||
      turn.revision !== revision ||
      pointerStartEpoch !== pointerEpoch ||
      pointers.size ||
      !afterDispatch ||
      guideDraftContent(afterDispatch) !== content
    )
      return null;
    if (!(await flushLatest(revision))) return null;
    await releaseAcknowledged(turn, revision, true);
    const committed = latest().saved.current;
    if (!committed) return null;
    const workspaceRevision = committed.workspaceRevision;
    const isCurrent = () => {
      if (
        !current(turn) ||
        turn.revision !== revision ||
        pointerStartEpoch !== pointerEpoch ||
        pointers.size ||
        pending
      )
        return false;
      const args = latest();
      return (
        !args.conflict &&
        !turn.conflict &&
        !args.busy.current &&
        !args.autosaving.current &&
        args.saved.current === committed &&
        committed.workspaceRevision === workspaceRevision &&
        args.project !== null &&
        guideDraftContent(args.project) === content &&
        guideDraftContent(committed.project) === content &&
        guideHistoryAcknowledged(turn, args)
      );
    };
    if (!isCurrent()) return null;
    const acknowledgement = turn.acknowledgement;
    const receipt =
      acknowledgement?.committed === committed ? acknowledgement.checkpointReceipt : null;
    return { receipt: receipt ? { ...receipt } : null, isCurrent };
  }
  return {
    hasUnpublishedHistory: () => !guideHistoryAcknowledged(session, latest()),
    beginEdit,
    prepareCheckpointExit,
    beginInteraction(pointerId: number) {
      pointerStartEpoch += 1;
      const turn = getSession();
      pointers.set(pointerId, { turn, revision: turn.revision });
    },
    endInteraction(pointerId: number) {
      const started = pointers.get(pointerId);
      if (!started) return;
      // Native window and React bubble handlers can commit after this capture listener.
      window.setTimeout(() => {
        if (pointers.get(pointerId) !== started) return;
        pointers.delete(pointerId);
        if (!current(started.turn)) return;
        if (started.turn.revision !== started.revision) void completeEdit();
        else if (started.turn.publication) scheduleFinish(started.turn);
      }, 0);
    },
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
        previous?.editingHistory !== args.editingHistory ||
        (previous?.project !== args.project && !isTimestampRebase(previous?.project, args.project));
      if ((!previous || changed) && turn.revision === observedRevision) beginEdit();
      observedRevision = turn.revision;
      if (!previous || changed || previous.enabled === false || !previous.dirty)
        coordinator.request('document', {
          delay: GUIDE_AUTOSAVE_IDLE_MS,
          maxWait: GUIDE_AUTOSAVE_MAX_WAIT_MS,
        });
    },
    save() {
      const capture = captureLatest();
      capture.args.onSealEdit?.();
      const turn = capture.session;
      const revision = turn.revision;
      return saveCaptured(capture).then(async (saved) => {
        if (saved) await releaseAcknowledged(turn, revision, true);
        return saved;
      });
    },
    async flushLatest() {
      const turn = getSession();
      const revision = turn.revision;
      const result = await flushLatest();
      if (result) await releaseAcknowledged(turn, revision, true);
      return result;
    },
    dispose() {
      disposed = true;
      cancelFinish();
      coordinator.dispose();
      retire(session);
    },
  };
}

function guideHistoryAcknowledged(turn: Session | undefined, args: AutosaveInput): boolean {
  const history = args.editingHistory;
  if (history === undefined) return true;
  const acknowledgement = turn?.acknowledgement;
  if (
    acknowledgement &&
    acknowledgement.committed === args.saved.current &&
    sameGuideHistory(acknowledgement.editingHistory, history)
  )
    return true;
  return sameGuideHistory(args.saved.current?.editingHistory, history);
}

function sameGuideHistory(
  left: ScenarioEditingHistory | undefined,
  right: ScenarioEditingHistory
): boolean {
  return (
    left === right ||
    (left !== undefined &&
      left.version === right.version &&
      left.past.length === right.past.length &&
      left.future.length === right.future.length &&
      left.past.every((project, index) => project === right.past[index]) &&
      left.future.every((project, index) => project === right.future[index]))
  );
}

/** Owns one admitted scenario write, its committed revision and admission cleanup. */
function persistGuideDraft(
  { session: turn, args }: Capture,
  isCurrent: () => boolean,
  currentState: () => Pick<AutosaveInput, 'project' | 'editingHistory'>
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
  if (
    guideHistoryAcknowledged(turn, args) &&
    (source === base.project || guideDraftContent(source) === guideDraftContent(base.project))
  ) {
    if (args.actionId) args.onPublish(base.project, source, args.actionId);
    args.onStatus('saved');
    return Promise.resolve(true);
  }
  args.busy.current = true;
  args.autosaving.current = true;
  args.onStatus('saving');
  return saveScenarioProjectRecord(source, {
    expectedRevision: base.workspaceRevision,
    ...(args.actionId ? { historyActionId: args.actionId } : {}),
    ...(args.editingHistory === undefined ? {} : { editingHistory: args.editingHistory }),
  })
    .then((committed) => {
      turn.publicationCommitted = true;
      if (!isCurrent()) return false;
      const receipt = parseSyncCheckpointReceipt(committed.checkpointReceipt);
      turn.acknowledgement = {
        source,
        ...(args.editingHistory === undefined ? {} : { editingHistory: args.editingHistory }),
        committed,
        checkpointReceipt:
          receipt?.rootKind === 'scenario-project' && receipt.rootId === source.id ? receipt : null,
      };
      args.saved.current = committed;
      if (args.actionId) args.onPublish(committed.project, source, args.actionId);
      else args.onPublish(committed.project, source);
      const current = currentState();
      args.onStatus(
        current.editingHistory === args.editingHistory &&
          (current.project === source ||
            (current.project && isTimestampRebase(source, current.project)))
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
