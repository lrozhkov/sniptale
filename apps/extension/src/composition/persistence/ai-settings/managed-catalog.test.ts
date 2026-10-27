import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIModel, AIProvider } from '../../../contracts/settings';
import type { AICatalogFacts } from '../../../contracts/settings/ai-catalog';
import {
  AI_MODELS_KEY,
  AI_PROVIDERS_KEY,
  AI_SCENARIO_SELECTIONS_KEY,
  AI_STORAGE_RESET_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';
import {
  admitStoredAICatalogRefresh,
  commitStoredAICatalogRefresh,
  mutateStoredAISettings,
  resetAISettingsMutationQueueForTests,
} from './graph-mutations';
import { resetIncompatibleAISettings } from './alpha-reset';
import { prepareAIProviderTransferMutation } from './provider-secrets.store';
import {
  runWithExclusivePersistenceMutationPermit,
  runWithPersistenceMutationPermit,
  isActivePersistenceMutationPermit,
  installPersistenceLockManagerForTests,
  runWithPersistentDataErasureBarrier,
  type PersistenceLockManager,
} from '../infrastructure/mutation-barrier';

const storage = vi.hoisted(() => {
  const state: Record<'local' | 'sync' | 'session', Record<string, unknown>> = {
    local: {},
    sync: {},
    session: {},
  };
  const makeArea = (area: keyof typeof state) => ({
    get: vi.fn(async (keys: string | string[]) =>
      Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys])
          .filter((key) => Object.hasOwn(state[area], key))
          .map((key) => [key, state[area][key]])
      )
    ),
    set: vi.fn(async (items: Record<string, unknown>, permit?: unknown) => {
      const apply = () => {
        Object.assign(state[area], items);
      };
      if (isActivePersistenceMutationPermit(permit)) apply();
      else await runWithPersistenceMutationPermit(apply);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[area][key];
    }),
  });
  return { state, local: makeArea('local'), sync: makeArea('sync'), session: makeArea('session') };
});
vi.mock('../infrastructure/browser-storage', async (original) => ({
  ...(await original()),
  browserStorage: storage,
}));

const provider: AIProvider = {
  id: 'provider',
  name: 'Provider',
  connectionType: 'neuraldeep',
  baseUrl: 'https://api.neuraldeep.ru/v1',
  hasStoredApiKey: false,
  createdAt: 1,
  enabled: true,
  management: 'automatic',
  incarnation: 'incarnation',
  revision: 1,
  credentialRevision: 1,
};
const facts: AICatalogFacts = {
  displayName: 'Catalog text',
  lifecycle: 'active',
  observedAt: 1000,
  capabilities: {
    operations: { text: 'supported' },
    input: { text: 'supported' },
    output: { text: 'supported' },
    features: {},
  },
};
const catalog = {
  kind: 'catalog' as const,
  complete: true,
  models: [{ modelCode: 'exact-id', facts }],
};
const DAY = 24 * 60 * 60 * 1000;

async function admit(now = 1000) {
  const admission = await admitStoredAICatalogRefresh(provider.id, true, now);
  expect(admission).not.toBeNull();
  return admission!;
}
function models(): AIModel[] {
  return storage.state.local[AI_MODELS_KEY] as AIModel[];
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAISettingsMutationQueueForTests();
  storage.state.local = {
    [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    [AI_PROVIDERS_KEY]: [{ ...provider }],
    [AI_MODELS_KEY]: [],
  };
  storage.state.sync = {};
  storage.state.session = {};
});

describe('serialized managed catalog commits', () => {
  it('preserves a manual model added while the catalog request is outside the mutation queue', async () => {
    const { token } = await admit();
    await mutateStoredAISettings({
      operation: 'add-model',
      model: {
        id: 'manual',
        providerId: provider.id,
        modelCode: 'manual-id',
        displayName: 'Manual',
        source: 'manual',
      },
    });
    expect(await commitStoredAICatalogRefresh(token, catalog, 1100)).toBe(true);
    expect(models().map((entry) => entry.modelCode)).toEqual(['manual-id', 'exact-id']);
  });

  it('rejects an older refresh when parallel requests finish in reverse order', async () => {
    const first = await admit();
    const second = await admit(1100);
    expect(await commitStoredAICatalogRefresh(second.token, catalog, 1200)).toBe(true);
    expect(
      await commitStoredAICatalogRefresh(
        first.token,
        { ...catalog, models: [{ modelCode: 'stale', facts }] },
        1300
      )
    ).toBe(false);
    expect(models().map((entry) => entry.modelCode)).toEqual(['exact-id']);
  });

  it('refuses delayed catalog results after provider deletion and same-ID recreation', async () => {
    const { token } = await admit();
    await mutateStoredAISettings({ operation: 'delete-provider', providerId: provider.id });
    expect(await commitStoredAICatalogRefresh(token, catalog, 1100)).toBe(false);
    await mutateStoredAISettings({ operation: 'add-provider', provider: { ...provider } });
    expect(await commitStoredAICatalogRefresh(token, catalog, 1200)).toBe(false);
    expect(models()).toEqual([]);
  });

  it('rejects delayed results after a provider configuration or credential revision changes', async () => {
    const { token } = await admit();
    await mutateStoredAISettings({
      operation: 'update-provider',
      provider: { ...provider, name: 'Renamed' },
    });
    expect(await commitStoredAICatalogRefresh(token, catalog, 1100)).toBe(false);
    const next = await admit(1200);
    await mutateStoredAISettings({ operation: 'clear-provider-secret', providerId: provider.id });
    expect(await commitStoredAICatalogRefresh(next.token, catalog, 1300)).toBe(false);
  });

  it('rejects delayed catalog results across alpha reset and metadata restore', async () => {
    const beforeReset = await admit();
    storage.state.local[AI_STORAGE_VERSION_KEY] = 3;
    await resetIncompatibleAISettings();
    expect(await commitStoredAICatalogRefresh(beforeReset.token, catalog, 1100)).toBe(false);
    storage.state.local[AI_PROVIDERS_KEY] = [{ ...provider }];
    const beforeRestore = await admit(1200);
    await runWithExclusivePersistenceMutationPermit(async (permit) => {
      const restore = await prepareAIProviderTransferMutation({
        importedProviders: [provider],
        permit,
      });
      await restore.commit();
    });
    expect(await commitStoredAICatalogRefresh(beforeRestore.token, catalog, 1300)).toBe(false);
    expect(models()).toEqual([]);
  });

  it('rejects an erased or reset-in-progress storage state without writes', async () => {
    const { token } = await admit();
    storage.state.local = {};
    storage.local.set.mockClear();
    expect(await commitStoredAICatalogRefresh(token, catalog, 1100)).toBe(false);
    expect(storage.local.set).not.toHaveBeenCalled();
    storage.state.local = {
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
      [AI_STORAGE_RESET_PHASE_KEY]: 'pending',
      [AI_PROVIDERS_KEY]: [provider],
    };
    expect(await admitStoredAICatalogRefresh(provider.id, true, 1200)).toBeNull();
  });

  it('allows a refused storage commit to retry and consumes the token after success', async () => {
    const { token } = await admit();
    storage.local.set.mockRejectedValueOnce(new Error('Storage refused'));
    await expect(commitStoredAICatalogRefresh(token, catalog, 1100)).rejects.toThrow(
      'Storage refused'
    );
    expect(await commitStoredAICatalogRefresh(token, catalog, 1200)).toBe(true);
    const id = models()[0]!.id;
    expect(await commitStoredAICatalogRefresh(token, catalog, 1300)).toBe(false);
    expect(models()).toHaveLength(1);
    expect(models()[0]!.id).toBe(id);
  });

  it('does not rewrite unchanged model records or discard manual overrides on refresh', async () => {
    const first = await admit();
    await commitStoredAICatalogRefresh(first.token, catalog, 1100);
    const existing = models()[0]!;
    const second = await admit(1200);
    storage.local.set.mockClear();
    await commitStoredAICatalogRefresh(second.token, catalog, 1300);
    expect(storage.local.set.mock.calls[0]![0]).not.toHaveProperty(AI_MODELS_KEY);
    expect(models()[0]).toBe(existing);
    await mutateStoredAISettings({
      operation: 'update-model',
      model: {
        ...existing,
        source: 'manual',
        displayName: 'My label',
        capabilities: { ...facts.capabilities, input: { text: 'supported', image: 'unsupported' } },
      },
    });
    const third = await admit(1400);
    await commitStoredAICatalogRefresh(
      third.token,
      {
        ...catalog,
        models: [
          {
            modelCode: 'exact-id',
            facts: {
              ...facts,
              displayName: 'New provider label',
              capabilities: { ...facts.capabilities, input: { image: 'supported' } },
            },
          },
        ],
      },
      1500
    );
    expect(models()[0]).toMatchObject({
      id: existing.id,
      displayName: 'My label',
      capabilities: { input: { image: 'unsupported' } },
      catalog: { displayName: 'New provider label' },
    });
  });

  it('retains referenced absent records and does not treat failures or partial snapshots as absence', async () => {
    const first = await admit();
    await commitStoredAICatalogRefresh(first.token, catalog, 1100);
    const id = models()[0]!.id;
    storage.state.local[AI_SCENARIO_SELECTIONS_KEY] = { 'page-edit': { modelId: id } };
    const failed = await admit(1200);
    await commitStoredAICatalogRefresh(
      failed.token,
      { kind: 'failure', reason: 'invalid-credential' },
      1300
    );
    expect(models()[0]!.catalog?.lifecycle).toBe('active');
    const partial = await admit(1400);
    await commitStoredAICatalogRefresh(
      partial.token,
      { kind: 'catalog', models: [], complete: false },
      1500
    );
    expect(models()[0]!.catalog?.lifecycle).toBe('active');
    const absent = await admit(1600);
    await commitStoredAICatalogRefresh(
      absent.token,
      { kind: 'catalog', models: [], complete: true },
      1700
    );
    const retained = await admit(40 * DAY);
    await commitStoredAICatalogRefresh(
      retained.token,
      { kind: 'catalog', models: [], complete: true },
      40 * DAY + 1
    );
    expect(models()).toHaveLength(1);
    expect(models()[0]!.catalog).toMatchObject({ lifecycle: 'absent', absenceCount: 2 });
  });

  it('uses the daily refresh budget and failed-attempt cooldown, with explicit retry', async () => {
    const first = await admit();
    await commitStoredAICatalogRefresh(first.token, { kind: 'failure', reason: 'network' }, 1100);
    expect(await admitStoredAICatalogRefresh(provider.id, false, 1200)).toBeNull();
    const retry = await admit(1300);
    await commitStoredAICatalogRefresh(retry.token, catalog, 1400);
    expect(await admitStoredAICatalogRefresh(provider.id, false, 1500)).toBeNull();
    expect(await admitStoredAICatalogRefresh(provider.id, false, DAY + 1500)).not.toBeNull();
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => installPersistenceLockManagerForTests(null));

/** Uses the existing lock seam to observe a queued publication without timing delays. */
async function holdGraphTransition(change: () => void) {
  const requested = deferred();
  const entered = deferred();
  const release = deferred();
  const queues = new Map<string, Promise<unknown>>();
  let observe = false;
  installPersistenceLockManagerForTests({
    request(name, options, operation) {
      if (name.endsWith(':transition') && options.mode === 'shared')
        return Promise.resolve(operation());
      if (observe && name === 'sniptale:persistence:privacy-erasure') requested.resolve();
      const previous = queues.get(name) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(() => operation());
      queues.set(
        name,
        next.then(
          () => undefined,
          () => undefined
        )
      );
      return next;
    },
  });
  const transition = runWithExclusivePersistenceMutationPermit(async () => {
    entered.resolve();
    await release.promise;
    change();
  });
  await entered.promise;
  observe = true;
  return { requested: requested.promise, release: release.resolve, transition };
}

it.each(['add', 'update', 'delete', 'move'] as const)(
  'preserves a restored same-ID graph when %s publication waits for its permit',
  async (operation) => {
    const target = {
      id: 'target',
      providerId: provider.id,
      modelCode: 'target',
      displayName: 'Old target',
    };
    const oldOnly = {
      id: 'old-only',
      providerId: provider.id,
      modelCode: 'old-only',
      displayName: 'Old only',
    };
    const restoredOnly = {
      id: 'restored-only',
      providerId: provider.id,
      modelCode: 'restored-only',
      displayName: 'Restored only',
    };
    storage.state.local[AI_MODELS_KEY] = [target, oldOnly];
    const gate = await holdGraphTransition(() => {
      storage.state.local[AI_PROVIDERS_KEY] = [{ ...provider, incarnation: 'restored' }];
      storage.state.local[AI_MODELS_KEY] =
        operation === 'move'
          ? [{ ...target, displayName: 'Restored target' }, restoredOnly]
          : [restoredOnly, { ...target, displayName: 'Restored target' }];
    });
    const write =
      operation === 'add'
        ? mutateStoredAISettings({
            operation: 'add-model',
            model: { ...target, id: 'added', modelCode: 'added' },
          })
        : operation === 'update'
          ? mutateStoredAISettings({
              operation: 'update-model',
              model: { ...target, displayName: 'Edited target' },
            })
          : operation === 'delete'
            ? mutateStoredAISettings({ operation: 'delete-model', modelId: target.id })
            : mutateStoredAISettings({
                operation: 'move-model',
                modelId: target.id,
                beforeModelId: null,
              });
    await gate.requested;
    gate.release();
    await gate.transition;
    await write;
    expect(models().some((model) => model.id === 'restored-only')).toBe(true);
    expect(models().some((model) => model.id === 'old-only')).toBe(false);
    if (operation === 'add')
      expect(models().map((model) => model.id)).toEqual(['restored-only', 'target', 'added']);
    if (operation === 'update')
      expect(models().find((model) => model.id === 'target')?.displayName).toBe('Edited target');
    if (operation === 'delete')
      expect(models().map((model) => model.id)).toEqual(['restored-only']);
    if (operation === 'move')
      expect(models().map((model) => model.id)).toEqual(['restored-only', 'target']);
  }
);
it('refuses model publication after a queued reset enters its pending phase', async () => {
  const gate = await holdGraphTransition(() => {
    storage.state.local[AI_STORAGE_RESET_PHASE_KEY] = 'pending';
    storage.state.local[AI_MODELS_KEY] = [];
    storage.state.local[AI_PROVIDERS_KEY] = [];
  });
  const write = mutateStoredAISettings({
    operation: 'add-model',
    model: { id: 'new', providerId: provider.id, modelCode: 'new', displayName: 'New' },
  });
  const outcome = write.then(
    () => 'accepted',
    () => 'refused'
  );
  await gate.requested;
  gate.release();
  await gate.transition;
  expect(await outcome).toBe('refused');
  expect(models()).toEqual([]);
});

it.each(['add', 'update'] as const)(
  'refuses delayed %s after provider deletion without publishing an orphan',
  async (operation) => {
    const model = {
      id: 'target',
      providerId: provider.id,
      modelCode: 'target',
      displayName: 'Target',
    };
    storage.state.local[AI_MODELS_KEY] = [model];
    const gate = await holdGraphTransition(() => {
      storage.state.local[AI_PROVIDERS_KEY] = [];
      storage.state.local[AI_MODELS_KEY] = [];
    });
    const write = mutateStoredAISettings({
      operation: operation === 'add' ? 'add-model' : 'update-model',
      model,
    });
    const refusal = expect(write).rejects.toThrow('not found');
    await gate.requested;
    gate.release();
    await gate.transition;
    await refusal;
    expect(models()).toEqual([]);
  }
);
it('preserves parallel manual model additions through the serialized graph owner', async () => {
  const entered = deferred();
  const release = deferred();
  const publish = storage.local.set.getMockImplementation()!;
  storage.local.set.mockImplementationOnce(async (items, permit) => {
    entered.resolve();
    await release.promise;
    await publish(items, permit);
  });
  const first = mutateStoredAISettings({
    operation: 'add-model',
    model: { id: 'first', providerId: provider.id, modelCode: 'first', displayName: 'First' },
  });
  await entered.promise;
  const second = mutateStoredAISettings({
    operation: 'add-model',
    model: { id: 'second', providerId: provider.id, modelCode: 'second', displayName: 'Second' },
  });
  release.resolve();
  await Promise.all([first, second]);
  expect(models().map((model) => model.id)).toEqual(['first', 'second']);
});
it('preserves the accepted model graph after storage refusal and permits one explicit retry', async () => {
  const model = { id: 'new', providerId: provider.id, modelCode: 'new', displayName: 'New' };
  const command = { operation: 'add-model' as const, model };
  storage.local.set.mockRejectedValueOnce(new Error('Storage refused'));
  await expect(mutateStoredAISettings(command)).rejects.toThrow('Storage refused');
  expect(models()).toEqual([]);
  await mutateStoredAISettings(command);
  expect(models()).toEqual([model]);
});

it.each(['prompt', 'catalog'] as const)(
  'lets FIFO erasure complete when model publication overlaps queued %s',
  async (actor) => {
    type Pending = { mode: 'shared' | 'exclusive'; run: () => void };
    const locks = new Map<string, { shared: number; exclusive: boolean; pending: Pending[] }>();
    const blocked = deferred();
    function drain(name: string) {
      const state = locks.get(name)!;
      if (state.exclusive) return;
      while (state.pending.length) {
        const next = state.pending[0]!;
        if (next.mode === 'exclusive' && state.shared) return;
        state.pending.shift();
        if (next.mode === 'exclusive') state.exclusive = true;
        else state.shared++;
        next.run();
        if (state.exclusive) return;
      }
    }
    const manager: PersistenceLockManager = {
      request(name, options, operation) {
        if (!locks.has(name)) locks.set(name, { shared: 0, exclusive: false, pending: [] });
        const state = locks.get(name)!;
        if (
          name.endsWith(':transition') &&
          options.mode === 'shared' &&
          state.shared &&
          state.pending.some((item) => item.mode === 'exclusive')
        )
          blocked.resolve();
        return new Promise((resolve, reject) => {
          state.pending.push({
            mode: options.mode,
            run() {
              void Promise.resolve()
                .then(() => operation())
                .then(resolve, reject)
                .finally(() => {
                  if (options.mode === 'exclusive') state.exclusive = false;
                  else state.shared--;
                  drain(name);
                });
            },
          });
          drain(name);
        });
      },
    };
    installPersistenceLockManagerForTests(manager);
    const entered = deferred();
    const release = deferred();
    const publish = storage.local.set.getMockImplementation()!;
    storage.local.set.mockImplementationOnce(async (items) => {
      await runWithPersistenceMutationPermit(async (permit) => {
        entered.resolve();
        await release.promise;
        await publish(items, permit);
      });
    });
    const earlier = mutateStoredAISettings({ operation: 'save-chrome-ai-enabled', enabled: true });
    await entered.promise;
    const catalogRead =
      actor === 'catalog' ? admitStoredAICatalogRefresh(provider.id, true) : Promise.resolve(null);
    const model = mutateStoredAISettings({
      operation: 'add-model',
      model: {
        id: 'queued',
        providerId: provider.id,
        modelCode: 'queued',
        displayName: 'Queued',
      },
    });
    const prompt =
      actor === 'prompt'
        ? mutateStoredAISettings({
            operation: 'save-voice-input-correction-prompt',
            prompt: 'Correct',
          })
        : Promise.resolve();
    const erased = vi.fn(() => {
      storage.state.local = {};
    });
    const erasure = runWithPersistentDataErasureBarrier(erased);
    const completed = Promise.allSettled([earlier, catalogRead, model, prompt, erasure]).then(
      () => 'completed'
    );
    release.resolve();
    expect(await Promise.race([completed, blocked.promise.then(() => 'blocked')])).toBe(
      'completed'
    );
    expect(erased).toHaveBeenCalledOnce();
    expect(storage.state.local).toEqual({});
  }
);
