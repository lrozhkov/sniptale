import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  admitStoredAIOperation,
  commitStoredAIOperation,
  mutateStoredAISettings,
  resetAISettingsMutationQueueForTests,
} from './graph-mutations';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';
import { AI_PROVIDERS_KEY, AI_STORAGE_VERSION_KEY, AI_STORAGE_RESET_PHASE_KEY } from './constants';
import { prepareAIProviderTransferMutation } from './provider-secrets.store';
import {
  runWithExclusivePersistenceMutationPermit,
  installPersistenceLockManagerForTests,
} from '../infrastructure/mutation-barrier';
import { storage, provider, models, resetStorageFixture } from './managed-catalog.test-support';

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

async function binding() {
  return {
    providerId: provider.id,
    incarnation: provider.incarnation!,
    revision: provider.revision!,
    credentialRevision: provider.credentialRevision!,
    destination: await createAIProviderDestinationBinding(provider),
  };
}
async function admit() {
  const token = await admitStoredAIOperation(await binding());
  expect(token).not.toBeNull();
  return token!;
}
function current() {
  return (storage.state.local[AI_PROVIDERS_KEY] as (typeof provider)[])[0]!;
}

it('retains success time after failure and leaves the provider enabled', async () => {
  const success = await admit();
  expect(await commitStoredAIOperation(success, { kind: 'success' }, 1000)).toBe(true);
  const failure = await admit();
  expect(
    await commitStoredAIOperation(failure, { kind: 'failure', reason: 'invalid-credential' }, 2000)
  ).toBe(true);
  expect(current()).toMatchObject({
    enabled: true,
    observation: {
      scope: 'operation',
      status: 'unavailable',
      reason: 'invalid-credential',
      checkedAt: 2000,
      lastSuccessAt: 1000,
      revision: 1,
    },
  });
  expect(current().operationGeneration).toBeUndefined();
});

it('rejects reverse completion and preserves a model added by a parallel writer', async () => {
  const first = await admit();
  const second = await admit();
  await mutateStoredAISettings({
    operation: 'add-model',
    model: {
      id: 'manual',
      providerId: provider.id,
      modelCode: 'manual',
      displayName: 'Manual',
      source: 'manual',
    },
  });
  expect(
    await commitStoredAIOperation(second, { kind: 'failure', reason: 'rate-limited' }, 2000)
  ).toBe(true);
  expect(await commitStoredAIOperation(first, { kind: 'success' }, 3000)).toBe(false);
  expect(current().observation?.reason).toBe('rate-limited');
  expect(models().map((model) => model.id)).toEqual(['manual']);
});

it('rejects delayed publication after deletion and same-ID recreation', async () => {
  const token = await admit();
  await mutateStoredAISettings({ operation: 'delete-provider', providerId: provider.id });
  expect(await commitStoredAIOperation(token, { kind: 'success' }, 1000)).toBe(false);
  await mutateStoredAISettings({ operation: 'add-provider', provider: { ...provider } });
  expect(await commitStoredAIOperation(token, { kind: 'success' }, 2000)).toBe(false);
  expect(current().observation?.status).toBe('unverified');
});

it('rejects delayed publication after configuration, credential and destination changes', async () => {
  const token = await admit();
  await mutateStoredAISettings({
    operation: 'update-provider',
    provider: { ...provider, name: 'Renamed' },
  });
  expect(await commitStoredAIOperation(token, { kind: 'success' }, 1000)).toBe(false);
  expect(await admitStoredAIOperation(await binding())).toBeNull();
  const currentBinding = { ...(await binding()), revision: current().revision! };
  const next = await admitStoredAIOperation(currentBinding);
  expect(next).not.toBeNull();
  await mutateStoredAISettings({ operation: 'clear-provider-secret', providerId: provider.id });
  expect(await commitStoredAIOperation(next!, { kind: 'success' }, 2000)).toBe(false);
  storage.state.local[AI_PROVIDERS_KEY] = [
    { ...provider, baseUrl: 'https://replacement.example/v1' },
  ];
  expect(await admitStoredAIOperation(await binding())).toBeNull();
});

it('rejects delayed publication across metadata restore', async () => {
  const token = await admit();
  await runWithExclusivePersistenceMutationPermit(async (permit) => {
    const restore = await prepareAIProviderTransferMutation({
      importedProviders: [provider],
      permit,
    });
    await restore.commit();
  });
  expect(await commitStoredAIOperation(token, { kind: 'success' }, 1000)).toBe(false);
});

it('refuses erased or reset-in-progress state without initialization or writes', async () => {
  const token = await admit();
  storage.state.local = {};
  storage.local.set.mockClear();
  expect(await commitStoredAIOperation(token, { kind: 'success' }, 1000)).toBe(false);
  expect(await admitStoredAIOperation(await binding())).toBeNull();
  expect(storage.local.set).not.toHaveBeenCalled();
  resetStorageFixture();
  storage.state.local[AI_STORAGE_RESET_PHASE_KEY] = 'pending';
  expect(await admitStoredAIOperation(await binding())).toBeNull();
  delete storage.state.local[AI_STORAGE_RESET_PHASE_KEY];
  storage.state.local[AI_STORAGE_VERSION_KEY] = -1;
  expect(await admitStoredAIOperation(await binding())).toBeNull();
});

it('permits an explicit refused commit retry and consumes the successful token', async () => {
  const token = await admit();
  storage.local.set.mockRejectedValueOnce(new Error('Storage refused'));
  await expect(commitStoredAIOperation(token, { kind: 'success' }, 1000)).rejects.toThrow(
    'Storage refused'
  );
  expect(await commitStoredAIOperation(token, { kind: 'success' }, 2000)).toBe(true);
  expect(await commitStoredAIOperation(token, { kind: 'success' }, 3000)).toBe(false);
});

it.each(['model-unavailable', 'permission-denied', 'unknown'] as const)(
  'does not publish model-local or ambiguous %s failure as a connection failure',
  async (reason) => {
    const token = await admit();
    const before = current().observation;
    storage.local.set.mockClear();
    expect(await commitStoredAIOperation(token, { kind: 'failure', reason }, 1000)).toBe(false);
    expect(current().observation).toEqual(before);
    expect(storage.local.set).not.toHaveBeenCalled();
  }
);

it('refuses a disabled provider and captures no secret or model payload in its token', async () => {
  const token = await admit();
  expect(Object.keys(token).sort()).toEqual([
    'credentialRevision',
    'destination',
    'generation',
    'incarnation',
    'providerId',
    'revision',
  ]);
  storage.state.local[AI_PROVIDERS_KEY] = [{ ...current(), enabled: false }];
  expect(await commitStoredAIOperation(token, { kind: 'success' }, 1000)).toBe(false);
  expect(await admitStoredAIOperation(await binding())).toBeNull();
});
