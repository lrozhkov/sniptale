export const TEMPORARY_ACTIVE_TABS_STORAGE_KEY = 'sniptale_page_access_active_tabs';

type TemporaryTabActivationTarget = {
  tabId: number;
  url: URL;
};

export type TemporaryTabActivationStorage = {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};

export type TemporaryTabActivationStore = {
  clear(tabId: number): Promise<void>;
  grant(target: TemporaryTabActivationTarget): Promise<void>;
  has(target: TemporaryTabActivationTarget): Promise<boolean>;
  hydrate(): Promise<Map<number, string>>;
};

type TemporaryTabActivationStoreDeps = {
  now?: () => number;
  storage: TemporaryTabActivationStorage;
};

type TemporaryTabActivationStoreState = {
  memoryCache: Map<number, string>;
  mutationQueue: Promise<void>;
  storageWriteFailed: boolean;
};

type StoredTemporaryActiveTab = {
  tabId: number;
  updatedAtMs?: number;
  url: string;
};

function isStoredTemporaryActiveTab(value: unknown): value is StoredTemporaryActiveTab {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record['tabId'] === 'number' &&
    typeof record['url'] === 'string' &&
    (record['updatedAtMs'] === undefined || typeof record['updatedAtMs'] === 'number')
  );
}

function replaceTemporaryActiveTabs(
  cache: Map<number, string>,
  entries: Map<number, string>
): void {
  cache.clear();
  entries.forEach((url, tabId) => cache.set(tabId, url));
}

function parseTemporaryActiveTabs(stored: unknown): Map<number, string> {
  const entries = new Map<number, string>();
  if (Array.isArray(stored)) {
    stored.filter(isStoredTemporaryActiveTab).forEach((entry) => {
      entries.set(entry.tabId, entry.url);
    });
  }
  return entries;
}

function serializeTemporaryActiveTabs(
  entries: Map<number, string>,
  updatedAtMs: number
): StoredTemporaryActiveTab[] {
  return Array.from(entries, ([tabId, url]) => ({ tabId, updatedAtMs, url }));
}

async function readTemporaryActiveTabs({
  state,
  storage,
}: {
  state: TemporaryTabActivationStoreState;
  storage: TemporaryTabActivationStorage;
}): Promise<Map<number, string>> {
  try {
    const result = await storage.get([TEMPORARY_ACTIVE_TABS_STORAGE_KEY]);
    const stored = result[TEMPORARY_ACTIVE_TABS_STORAGE_KEY];
    if (state.storageWriteFailed) {
      return new Map(state.memoryCache);
    }

    const entries = parseTemporaryActiveTabs(stored);
    replaceTemporaryActiveTabs(state.memoryCache, entries);
    return entries;
  } catch {
    return new Map(state.memoryCache);
  }
}

async function writeTemporaryActiveTabs({
  entries,
  now,
  state,
  storage,
}: {
  entries: Map<number, string>;
  now: () => number;
  state: TemporaryTabActivationStoreState;
  storage: TemporaryTabActivationStorage;
}): Promise<void> {
  replaceTemporaryActiveTabs(state.memoryCache, entries);
  const stored = serializeTemporaryActiveTabs(entries, now());
  try {
    await storage.set({ [TEMPORARY_ACTIVE_TABS_STORAGE_KEY]: stored });
    state.storageWriteFailed = false;
  } catch {
    state.storageWriteFailed = true;
    // Keep this worker's activation usable when session storage is transiently unavailable.
  }
}

function runTemporaryTabActivationMutation<T>({
  operation,
  readEntries,
  state,
}: {
  operation: (entries: Map<number, string>) => Promise<T> | T;
  readEntries: () => Promise<Map<number, string>>;
  state: TemporaryTabActivationStoreState;
}): Promise<T> {
  const nextMutation = state.mutationQueue
    .catch(() => undefined)
    .then(async () => {
      const entries = await readEntries();
      return operation(entries);
    });
  state.mutationQueue = nextMutation.then(
    () => undefined,
    () => undefined
  );
  return nextMutation;
}

export function createTemporaryTabActivationStore({
  now = Date.now,
  storage,
}: TemporaryTabActivationStoreDeps): TemporaryTabActivationStore {
  const state: TemporaryTabActivationStoreState = {
    memoryCache: new Map<number, string>(),
    mutationQueue: Promise.resolve<void>(undefined),
    storageWriteFailed: false,
  };
  const readEntries = () => readTemporaryActiveTabs({ state, storage });
  const writeEntries = (entries: Map<number, string>) =>
    writeTemporaryActiveTabs({ entries, now, state, storage });
  const runMutation = <T>(operation: (entries: Map<number, string>) => Promise<T> | T) =>
    runTemporaryTabActivationMutation({ operation, readEntries, state });

  return {
    clear(tabId) {
      return runMutation(async (entries) => {
        entries.delete(tabId);
        await writeEntries(entries);
      });
    },
    grant(target) {
      return runMutation(async (entries) => {
        entries.set(target.tabId, target.url.href);
        await writeEntries(entries);
      });
    },
    has(target) {
      return runMutation(async (entries) => {
        const activatedUrl = entries.get(target.tabId);
        if (!activatedUrl) {
          return false;
        }

        if (activatedUrl === target.url.href) {
          return true;
        }

        entries.delete(target.tabId);
        await writeEntries(entries);
        return false;
      });
    },
    hydrate() {
      return runMutation((entries) => new Map(entries));
    },
  };
}
