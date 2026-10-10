/** Timing policy belongs to the editor adapter; requests retain no document snapshot. */
export type AutosavePolicy = { delay: number; maxWait?: number };

/** Explicit dependencies keep scheduling independent of storage, UI and document authority. */
type AutosaveDependencies<Key, Captured> = {
  now(): number;
  schedule(callback: () => void, delay: number): () => void;
  capture(key: Key, token: number): Captured;
  commit(captured: Captured, key: Key, token: number): Promise<void>;
  classifyFailure(error: unknown): 'retry' | 'stop';
};

type Pending = { token: number; firstAt: number; dueAt: number; forced: boolean; order: number };
type Waiter<Key> = {
  targets: Map<Key, number>;
  resolve(): void;
  reject(error: unknown): void;
};
type Ordered = { order: number; run(): Promise<void>; reject(error: unknown): void };

/**
 * One admission lane for coalesced autosave and accepted explicit commands.
 * Completion tokens describe adapter jobs; only the adapter can acknowledge durable storage.
 */
export function createAutosaveCoordinator<Key, Captured>(
  deps: AutosaveDependencies<Key, Captured>
) {
  const pending = new Map<Key, Pending>();
  const edits = new Map<Key, number>();
  const versions = new Map<Key, number>();
  const completed = new Map<Key, number>();
  const failures = new Map<Key, unknown>();
  const waiters = new Set<Waiter<Key>>();
  const ordered: Ordered[] = [];
  let cancelTimer: (() => void) | undefined;
  let active: { key: Key; token: number } | 'ordered' | undefined;
  let stopped = false;
  let stopError: unknown;
  let sequence = 0;
  let disposed = false;
  const unavailable = () => new Error('Autosave coordinator is disposed.');

  function settle() {
    for (const waiter of waiters) {
      let done = true;
      for (const [key, target] of waiter.targets) {
        if ((completed.get(key) ?? 0) >= target) continue;
        done = false;
        if (failures.has(key)) {
          waiter.reject(failures.get(key));
          waiters.delete(waiter);
          break;
        }
      }
      if (done) {
        waiter.resolve();
        waiters.delete(waiter);
      } else if (stopped && waiters.has(waiter)) {
        waiter.reject(stopError);
        waiters.delete(waiter);
      }
    }
  }
  function arm() {
    cancelTimer?.();
    cancelTimer = undefined;
    if (disposed || active) return;
    const ready =
      !stopped &&
      [...pending].some(
        ([key, entry]) => !failures.has(key) && (entry.forced || entry.dueAt <= deps.now())
      );
    if (ready || ordered.length) {
      void pump();
      return;
    }
    if (stopped) return;
    let due = Infinity;
    for (const [key, entry] of pending) {
      if (!failures.has(key)) due = Math.min(due, entry.dueAt);
    }
    if (due !== Infinity)
      cancelTimer = deps.schedule(
        () => {
          cancelTimer = undefined;
          void pump();
        },
        Math.max(0, due - deps.now())
      );
  }
  async function pump() {
    if (disposed || active) return;
    let chosen: [Key, Pending] | undefined;
    if (!stopped)
      for (const entry of pending) {
        if (failures.has(entry[0]) || (!entry[1].forced && entry[1].dueAt > deps.now())) continue;
        if (ordered[0] && ordered[0].order < entry[1].order) continue;
        if (!chosen || entry[1].order < chosen[1].order) chosen = entry;
      }
    if (chosen) {
      const [key, entry] = chosen;
      pending.delete(key);
      active = { key, token: entry.token };
      try {
        const captured = deps.capture(key, entry.token);
        await deps.commit(captured, key, entry.token);
        if (!disposed) completed.set(key, Math.max(completed.get(key) ?? 0, entry.token));
      } catch (error) {
        if (!disposed) {
          failures.set(key, error);
          if (!pending.has(key)) pending.set(key, entry);
          stopped = deps.classifyFailure(error) === 'stop';
          if (stopped) stopError = error;
        }
      } finally {
        active = undefined;
        settle();
        arm();
      }
      return;
    }
    const next = ordered.shift();
    if (next) {
      active = 'ordered';
      try {
        await next.run();
      } finally {
        active = undefined;
        arm();
      }
    } else arm();
  }
  function targets(keys: Iterable<Key>) {
    const result = new Map<Key, number>();
    for (const key of keys) result.set(key, edits.get(key) ?? 0);
    return result;
  }
  function barrier(target: Map<Key, number>) {
    if (disposed) return Promise.reject(unavailable());
    const promise = new Promise<void>((resolve, reject) => {
      waiters.add({ targets: target, resolve, reject });
    });
    settle();
    arm();
    return promise;
  }
  return {
    /** Replaces uncaptured work for this producer; an active capture remains immutable. */
    request(key: Key, policy: AutosavePolicy) {
      if (disposed) throw unavailable();
      const token = (versions.get(key) ?? 0) + 1;
      versions.set(key, token);
      edits.set(key, token);
      const now = deps.now();
      const previous = pending.get(key);
      const firstAt = previous?.firstAt ?? now;
      pending.set(key, {
        token,
        firstAt,
        order: previous?.order ?? ++sequence,
        dueAt: Math.min(
          now + policy.delay,
          policy.maxWait === undefined ? Infinity : firstAt + policy.maxWait
        ),
        forced: previous?.forced ?? false,
      });
      if (!stopped) failures.delete(key);
      arm();
      return token;
    },
    /** Waits for tokens present at entry, including buffers not yet captured by the adapter. */
    flushCaptured(keys: Iterable<Key> = edits.keys()) {
      if (disposed) return Promise.reject(unavailable());
      const target = targets(keys);
      for (const key of target.keys())
        if (!edits.has(key) && failures.has(key)) {
          return Promise.reject(failures.get(key));
        }
      for (const key of target.keys()) {
        const entry = pending.get(key);
        if (entry) entry.forced = true;
        if (!stopped) failures.delete(key);
      }
      return barrier(target);
    },
    /** Accepted explicit operations never coalesce; callers establish their document barriers. */
    runOrdered<Result>(action: () => Promise<Result>): Promise<Result> {
      if (disposed) return Promise.reject(unavailable());
      return new Promise<Result>((resolve, reject) => {
        ordered.push({
          order: ++sequence,
          reject,
          run: async () => {
            try {
              resolve(await action());
            } catch (error) {
              reject(error);
            }
          },
        });
        arm();
      });
    },
    /** Cancels uncaptured edits only; an acquired commit remains the adapter's responsibility. */
    cancel(key: Key) {
      const cancellation = new Error('Autosave request was cancelled.');
      const activeToken = typeof active === 'object' && active.key === key ? active.token : 0;
      pending.delete(key);
      failures.set(key, cancellation);
      for (const waiter of waiters)
        if ((waiter.targets.get(key) ?? 0) > Math.max(completed.get(key) ?? 0, activeToken)) {
          waiter.reject(cancellation);
          waiters.delete(waiter);
        }
      if (activeToken) edits.set(key, activeToken);
      else edits.delete(key);
      arm();
    },
    /** Stops automatic admission after a failure reported by an explicit domain operation. */
    suspend(error: unknown) {
      stopped = true;
      stopError = error;
      settle();
      arm();
    },
    /** The domain owner calls this after recovering a conflict or changed source. */
    resume() {
      stopped = false;
      for (const key of failures.keys()) if (edits.has(key)) failures.delete(key);
      arm();
    },
    /** Drops unstarted work and rejects barriers; it cannot undo an active durable operation. */
    dispose() {
      disposed = true;
      cancelTimer?.();
      pending.clear();
      for (const waiter of waiters) waiter.reject(unavailable());
      waiters.clear();
      for (const command of ordered) command.reject(unavailable());
      ordered.length = 0;
    },
  };
}
