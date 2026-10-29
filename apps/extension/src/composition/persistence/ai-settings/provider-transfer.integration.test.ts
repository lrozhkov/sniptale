import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AI_PROVIDERS_KEY } from './constants';
import { mutateStoredAISettings, resetAISettingsMutationQueueForTests } from './graph-mutations';
import { prepareAIProviderTransferMutation } from './provider-secrets.store';
import {
  installPersistenceLockManagerForTests,
  runWithExclusivePersistenceMutationPermit,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import { storage, provider, resetStorageFixture } from './managed-catalog.test-support';

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
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function holdTransition(apply: (permit: PersistenceMutationPermit) => Promise<void>) {
  const entered = deferred();
  const release = deferred();
  const requested = deferred();
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
  const completion = runWithExclusivePersistenceMutationPermit(async (permit) => {
    entered.resolve();
    await release.promise;
    await apply(permit);
  });
  await entered.promise;
  observe = true;
  return { requested: requested.promise, release: release.resolve, completion };
}

it.each(['add', 'update', 'clear-secret', 'delete'] as const)(
  'retains the restored provider graph before queued %s',
  async (operation) => {
    storage.state.local[AI_PROVIDERS_KEY] = [provider, { ...provider, id: 'obsolete' }];
    const restored = { ...provider, id: 'restored-only' };
    const gate = await holdTransition(async (permit) => {
      const plan = await prepareAIProviderTransferMutation({
        importedProviders: [provider, restored],
        permit,
      });
      await plan.commit();
    });
    const edit =
      operation === 'add'
        ? mutateStoredAISettings({
            operation: 'add-provider',
            provider: { ...provider, id: 'added' },
          })
        : operation === 'update'
          ? mutateStoredAISettings({
              operation: 'update-provider',
              provider: { ...provider, name: 'Edited' },
            })
          : operation === 'clear-secret'
            ? mutateStoredAISettings({
                operation: 'clear-provider-secret',
                providerId: provider.id,
              })
            : mutateStoredAISettings({ operation: 'delete-provider', providerId: provider.id });
    await gate.requested;
    gate.release();
    await gate.completion;
    await edit;
    const ids = (storage.state.local[AI_PROVIDERS_KEY] as (typeof provider)[]).map(
      (entry) => entry.id
    );
    expect(ids).toEqual(
      operation === 'delete'
        ? ['restored-only']
        : operation === 'add'
          ? [provider.id, 'restored-only', 'added']
          : [provider.id, 'restored-only']
    );
    if (operation === 'update')
      expect(storage.state.local[AI_PROVIDERS_KEY]).toContainEqual(
        expect.objectContaining({ id: provider.id, name: 'Edited' })
      );
  }
);

it('refuses a queued provider update after erasure without publication', async () => {
  const gate = await holdTransition(async () => {
    storage.state.local = {};
  });
  storage.local.set.mockClear();
  const update = mutateStoredAISettings({
    operation: 'update-provider',
    provider: { ...provider, name: 'Late edit' },
  });
  const refusal = expect(update).rejects.toThrow('AI settings are not ready for graph publication');
  await gate.requested;
  gate.release();
  await gate.completion;
  await refusal;
  expect(storage.state.local).toEqual({});
  expect(storage.local.set).not.toHaveBeenCalled();
});
