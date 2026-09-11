const RESOURCE_GATE = 'sniptale:scenario:resource-readers';
const projectLock = (id: string) => `sniptale:scenario:open-project:${id}`;

/** A disposable editing session protects its current, undo and stale-copy resources. */
export interface ScenarioResourceSession {
  release(): Promise<void>;
}

function requireLocks(): LockManager | null {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (locks) return locks;
  if (typeof chrome !== 'undefined') throw new Error('Guide resource coordination is unavailable.');
  return null;
}

/** Acquire before loading the project; browser termination releases the shared lock. */
export async function acquireScenarioResourceSession(id: string): Promise<ScenarioResourceSession> {
  const locks = requireLocks();
  if (!locks) return { release: async () => undefined };
  let release!: () => void;
  let acquired!: () => void;
  let rejected!: (error: unknown) => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve, reject) => {
    acquired = resolve;
    rejected = reject;
  });
  const lifetime = locks.request(projectLock(id), { mode: 'shared' }, async () => {
    acquired();
    await held;
  });
  void lifetime.catch(rejected);
  await ready;
  return {
    release: async () => {
      release();
      await lifetime;
    },
  };
}

/** Protect inventory and physical file reads through the entire backup write/abort lifetime. */
export function runWithScenarioResourceRead<T>(operation: () => Promise<T>): Promise<T> {
  const locks = requireLocks();
  return locks ? locks.request(RESOURCE_GATE, { mode: 'shared' }, operation) : operation();
}

/** Maintenance never waits for an editor or export and never deletes without cross-tab admission. */
export async function tryScenarioResourceCleanup<T>(
  id: string,
  operation: () => Promise<T>
): Promise<T | undefined> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return undefined;
  return locks.request(RESOURCE_GATE, { mode: 'exclusive', ifAvailable: true }, (gate) =>
    gate
      ? locks.request(projectLock(id), { mode: 'exclusive', ifAvailable: true }, (project) =>
          project ? operation() : undefined
        )
      : undefined
  );
}
