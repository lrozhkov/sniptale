import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { runWithExclusivePersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { installPersistenceLockManagerForTests } from '../infrastructure/mutation-barrier';
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

const DAY = 24 * 60 * 60 * 1000;

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
