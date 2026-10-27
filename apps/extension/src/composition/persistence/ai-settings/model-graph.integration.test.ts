import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AI_MODELS_KEY, AI_PROVIDERS_KEY, AI_STORAGE_RESET_PHASE_KEY } from './constants';
import {
  admitStoredAICatalogRefresh,
  commitStoredAICatalogRefresh,
  mutateStoredAISettings,
  resetAISettingsMutationQueueForTests,
} from './graph-mutations';
import { parseStoredAIModels } from './guards';
import {
  runWithExclusivePersistenceMutationPermit,
  runWithPersistenceMutationPermit,
  runWithPersistentDataErasureBarrier,
} from '../infrastructure/mutation-barrier';
import {
  installPersistenceLockManagerForTests,
  type PersistenceLockManager,
} from '../infrastructure/mutation-barrier';
import {
  storage,
  provider,
  catalog,
  models,
  resetStorageFixture,
  facts,
} from './managed-catalog.test-support';

vi.mock('../infrastructure/browser-storage', async (original) => ({
  ...(await original()),
  browserStorage: (await import('./managed-catalog.test-support')).storage,
}));

beforeEach(() => {
  vi.clearAllMocks();
  resetAISettingsMutationQueueForTests();
  resetStorageFixture();
});
afterEach(() => installPersistenceLockManagerForTests(null));

async function admit(now = 1000) {
  const admission = await admitStoredAICatalogRefresh(provider.id, true, now);
  expect(admission).not.toBeNull();
  return admission!;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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

it('binds a manual allowlist record to current catalog properties without trusting submitted facts', async () => {
  const admission = await admit();
  await commitStoredAICatalogRefresh(admission.token, catalog, 1100);
  const original = models()[0]!;
  await mutateStoredAISettings({
    operation: 'update-model',
    model: {
      ...original,
      source: 'manual',
      propertySource: 'catalog',
      displayName: 'Submitted stale name',
      retirementOverride: true,
      capabilities: { ...facts.capabilities, operations: { speech: 'supported' } },
      catalog: { ...facts, displayName: 'Submitted catalog', lifecycle: 'active' },
    },
  });
  expect(models()).toHaveLength(1);
  expect(models()[0]).toMatchObject({
    id: original.id,
    source: 'manual',
    propertySource: 'catalog',
    displayName: facts.displayName,
    capabilities: facts.capabilities,
    retirementOverride: false,
    catalog: { scope: admission.token.scope, displayName: facts.displayName },
  });
});

it.each(['manual', 'catalog'] as const)(
  'preserves property ownership %s when a pending catalog result commits',
  async (propertySource) => {
    const first = await admit();
    await commitStoredAICatalogRefresh(first.token, catalog, 1100);
    const original = models()[0]!;
    const pending = await admit(2000);
    await mutateStoredAISettings({
      operation: 'update-model',
      model: {
        ...original,
        source: 'manual',
        propertySource,
        displayName: 'My name',
        enabled: false,
        capabilities: { ...facts.capabilities, operations: { speech: 'supported' } },
      },
    });
    const refreshed = { ...facts, displayName: 'Fresh catalog name', observedAt: 2200 };
    await commitStoredAICatalogRefresh(
      pending.token,
      {
        kind: 'catalog',
        complete: true,
        models: [{ modelCode: original.modelCode, facts: refreshed }],
      },
      2300
    );
    expect(models()).toHaveLength(1);
    expect(models()[0]).toMatchObject({
      id: original.id,
      source: 'manual',
      propertySource,
      enabled: false,
      displayName: propertySource === 'manual' ? 'My name' : 'Fresh catalog name',
      catalog: { displayName: 'Fresh catalog name' },
    });
    expect(models()[0]!.capabilities?.operations).toEqual(
      propertySource === 'manual' ? { speech: 'supported' } : facts.capabilities.operations
    );
  }
);

it('resets manual properties from the current catalog while preserving configured identity', async () => {
  const first = await admit();
  await commitStoredAICatalogRefresh(first.token, catalog, 1100);
  const original = models()[0]!;
  await mutateStoredAISettings({
    operation: 'update-model',
    model: {
      ...original,
      source: 'manual',
      propertySource: 'manual',
      displayName: 'Custom',
    },
  });
  const pending = await admit(2000);
  await commitStoredAICatalogRefresh(
    pending.token,
    {
      kind: 'catalog',
      complete: true,
      models: [
        {
          modelCode: original.modelCode,
          facts: { ...facts, displayName: 'Current reset values', observedAt: 2200 },
        },
      ],
    },
    2300
  );
  await mutateStoredAISettings({
    operation: 'update-model',
    model: {
      ...original,
      source: 'manual',
      propertySource: 'catalog',
    },
  });
  expect(models()[0]).toMatchObject({
    id: original.id,
    displayName: 'Current reset values',
    propertySource: 'catalog',
  });
});

it('refuses reset after catalog absence without changing the manual override', async () => {
  const first = await admit();
  await commitStoredAICatalogRefresh(first.token, catalog, 1100);
  const original = models()[0]!;
  await mutateStoredAISettings({
    operation: 'update-model',
    model: { ...original, source: 'manual', propertySource: 'manual', displayName: 'Keep custom' },
  });
  const pending = await admit(2000);
  await commitStoredAICatalogRefresh(
    pending.token,
    { kind: 'catalog', complete: true, models: [] },
    2300
  );
  const before = structuredClone(models());
  await expect(
    mutateStoredAISettings({
      operation: 'update-model',
      model: { ...original, source: 'manual', propertySource: 'catalog' },
    })
  ).rejects.toThrow('Current AI model catalog properties are unavailable');
  expect(models()).toEqual(before);
});

it('rejects an old catalog scope after same-ID provider recreation under a queued publication', async () => {
  const first = await admit();
  await commitStoredAICatalogRefresh(first.token, catalog, 1100);
  const original = models()[0]!;
  const gate = await holdGraphTransition(() => {
    storage.state.local[AI_PROVIDERS_KEY] = [{ ...provider, incarnation: 'recreated' }];
  });
  const write = mutateStoredAISettings({
    operation: 'update-model',
    model: {
      ...original,
      source: 'manual',
      propertySource: 'catalog',
    },
  });
  const refused = expect(write).rejects.toThrow(
    'Current AI model catalog properties are unavailable'
  );
  await gate.requested;
  gate.release();
  await gate.transition;
  await refused;
  expect(models()[0]).toEqual(original);
});

it.each(['provider', 'code'] as const)(
  'clears previous catalog identity when the configured %s changes',
  async (identity) => {
    const first = await admit();
    await commitStoredAICatalogRefresh(first.token, catalog, 1100);
    const original = models()[0]!;
    storage.state.local[AI_PROVIDERS_KEY] = [
      provider,
      { ...provider, id: 'other', incarnation: 'other' },
    ];
    await mutateStoredAISettings({
      operation: 'update-model',
      model: {
        id: original.id,
        providerId: identity === 'provider' ? 'other' : provider.id,
        modelCode: identity === 'code' ? 'new-code' : original.modelCode,
        displayName: 'Changed identity',
      },
    });
    expect(models()[0]).not.toHaveProperty('catalog');
    expect(models()[0]).not.toHaveProperty('capabilities');
    expect(models()[0]).not.toHaveProperty('retirementOverride');
  }
);

it('does not persist invented catalog provenance on a manual model', async () => {
  await mutateStoredAISettings({
    operation: 'add-model',
    model: {
      id: 'manual',
      providerId: provider.id,
      modelCode: 'not-in-catalog',
      displayName: 'Manual',
      source: 'manual',
      propertySource: 'manual',
      catalog: facts,
    },
  });
  expect(models()[0]).not.toHaveProperty('catalog');
});

it('retains accepted property ownership after refusal and applies explicit retry once', async () => {
  const first = await admit();
  await commitStoredAICatalogRefresh(first.token, catalog, 1100);
  const original = models()[0]!;
  const command = {
    operation: 'update-model' as const,
    model: {
      ...original,
      source: 'manual' as const,
      propertySource: 'manual' as const,
      displayName: 'Custom',
    },
  };
  storage.local.set.mockRejectedValueOnce(new Error('Storage refused'));
  await expect(mutateStoredAISettings(command)).rejects.toThrow('Storage refused');
  expect(models()[0]).toEqual(original);
  await mutateStoredAISettings(command);
  expect(models()).toHaveLength(1);
  expect(models()[0]).toMatchObject({
    id: original.id,
    displayName: 'Custom',
    propertySource: 'manual',
  });
});

it('retains valid stored property ownership and refuses malformed ownership without repairing storage', () => {
  const model = {
    id: 'stored',
    providerId: provider.id,
    modelCode: 'exact',
    displayName: 'Stored',
    source: 'manual',
    propertySource: 'catalog',
  };
  expect(parseStoredAIModels([model])).toEqual({
    value: [model],
    invalidEntryCount: 0,
    hasInvalidRoot: false,
  });
  expect(parseStoredAIModels([{ ...model, propertySource: 'invalid' }])).toEqual({
    value: [],
    invalidEntryCount: 1,
    hasInvalidRoot: false,
  });
  expect(storage.state.local[AI_MODELS_KEY]).toEqual([]);
});

it.each(['add-model', 'update-model'] as const)(
  'refuses an old form incarnation for queued %s after same-ID provider recreation',
  async (operation) => {
    const model = {
      id: 'manual',
      providerId: provider.id,
      modelCode: 'custom',
      displayName: 'Manual',
    };
    storage.state.local[AI_MODELS_KEY] = operation === 'update-model' ? [model] : [];
    const previous = structuredClone(models());
    const gate = await holdGraphTransition(() => {
      storage.state.local[AI_PROVIDERS_KEY] = [{ ...provider, incarnation: 'replacement' }];
    });
    const pending = mutateStoredAISettings({
      operation,
      model,
      providerIncarnation: provider.incarnation,
    });
    const refusal = expect(pending).rejects.toMatchObject({ reason: 'ai-provider-changed' });
    await gate.requested;
    gate.release();
    await gate.transition;
    await refusal;
    expect(models()).toEqual(previous);
  }
);

it('refuses stale queued creation after deletion and accepts a fresh same-ID retry', async () => {
  const model = {
    id: 'manual',
    providerId: provider.id,
    modelCode: 'custom',
    displayName: 'Manual',
  };
  const gate = await holdGraphTransition(() => {
    storage.state.local[AI_PROVIDERS_KEY] = [];
  });
  const pending = mutateStoredAISettings({
    operation: 'add-model',
    model,
    providerIncarnation: provider.incarnation,
  });
  const refusal = expect(pending).rejects.toMatchObject({ reason: 'ai-provider-changed' });
  await gate.requested;
  gate.release();
  await gate.transition;
  await refusal;
  expect(models()).toEqual([]);
  storage.state.local[AI_PROVIDERS_KEY] = [{ ...provider, incarnation: 'replacement' }];
  await mutateStoredAISettings({
    operation: 'add-model',
    model,
    providerIncarnation: 'replacement',
  });
  expect(models()).toEqual([model]);
});

it('ignores an obsolete dangling global selection during current graph mutations', async () => {
  storage.state.local['sniptale_ai_default_model'] = 'retired-missing-model';
  const next = {
    id: 'manual-current',
    providerId: provider.id,
    modelCode: 'manual-current',
    displayName: 'Current',
  };
  await mutateStoredAISettings({ operation: 'add-model', model: next });
  expect(parseStoredAIModels(storage.state.local[AI_MODELS_KEY]).value).toContainEqual(next);
  await mutateStoredAISettings({ operation: 'delete-model', modelId: next.id });
  expect(parseStoredAIModels(storage.state.local[AI_MODELS_KEY]).value).not.toContainEqual(next);
  expect(storage.state.local['sniptale_ai_default_model']).toBe('retired-missing-model');
});
