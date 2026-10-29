import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AIModel } from '../../../contracts/settings';
import type { AIModelOperation } from '../../../contracts/settings/ai-catalog';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';
import { selectSettingsTransferModelMetadata } from '../../../contracts/settings-transfer/model-metadata';
import { AI_MODELS_KEY, AI_PROVIDERS_KEY } from './constants';
import {
  admitStoredAIOperation,
  commitStoredAIOperation,
  mutateStoredAISettings,
  resetAISettingsMutationQueueForTests,
} from './graph-mutations';
import {
  installPersistenceLockManagerForTests,
  runWithExclusivePersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import { storage, provider, models, resetStorageFixture } from './managed-catalog.test-support';

vi.mock('../infrastructure/browser-storage', async (original) => ({
  ...(await original()),
  browserStorage: (await import('./managed-catalog.test-support')).storage,
}));
const model: AIModel = {
  id: 'model',
  providerId: provider.id,
  modelCode: 'exact',
  displayName: 'Multi-operation',
  source: 'manual',
  capabilities: {
    operations: { text: 'supported', speech: 'supported', transcription: 'supported' },
    input: {},
    output: {},
    features: {},
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  resetAISettingsMutationQueueForTests();
  resetStorageFixture();
  storage.state.local[AI_MODELS_KEY] = [{ ...model }];
});
afterEach(() => installPersistenceLockManagerForTests(null));
async function binding(
  operation: AIModelOperation = 'text',
  id = model.id,
  code = model.modelCode
) {
  return {
    providerId: provider.id,
    incarnation: provider.incarnation!,
    revision: provider.revision!,
    credentialRevision: provider.credentialRevision!,
    destination: await createAIProviderDestinationBinding(provider),
    model: { id, code, operation },
  };
}
async function admit(operation: AIModelOperation = 'text', id = model.id) {
  const receipt = await admitStoredAIOperation(await binding(operation, id));
  expect(receipt).not.toBeNull();
  return receipt!;
}
function observation(operation: AIModelOperation = 'text', id = model.id) {
  return models().find((entry) => entry.id === id)?.operationObservations?.[operation]?.observation;
}
function connection() {
  return (storage.state.local[AI_PROVIDERS_KEY] as (typeof provider)[])[0]!.observation;
}

it('retains model success time after local failure without changing connection state or lifecycle', async () => {
  expect(await commitStoredAIOperation(await admit(), { kind: 'success' }, 1000)).toBe(true);
  const providerBefore = connection();
  expect(
    await commitStoredAIOperation(
      await admit(),
      { kind: 'failure', reason: 'model-unavailable' },
      2000
    )
  ).toBe(true);
  expect(observation()).toMatchObject({
    scope: 'operation',
    status: 'unavailable',
    reason: 'model-unavailable',
    checkedAt: 2000,
    lastSuccessAt: 1000,
  });
  expect(connection()).toEqual(providerBefore);
  expect(models()[0]).toMatchObject({ id: model.id, capabilities: model.capabilities });
  expect(models()[0]?.catalog).toBeUndefined();
  expect(models()[0]?.operationObservations?.text?.generation).toBeUndefined();
});

it('rejects reverse completion on one model operation', async () => {
  const first = await admit();
  const second = await admit();
  expect(
    await commitStoredAIOperation(second, { kind: 'failure', reason: 'permission-denied' }, 2000)
  ).toBe(true);
  expect(await commitStoredAIOperation(first, { kind: 'success' }, 3000)).toBe(false);
  expect(observation()?.reason).toBe('permission-denied');
  expect(connection()).toBeUndefined();
});

it('preserves separate operation observations without overwriting newer provider authority', async () => {
  const text = await admit('text');
  const speech = await admit('speech');
  expect(await commitStoredAIOperation(text, { kind: 'success' }, 1000)).toBe(true);
  expect(connection()).toBeUndefined();
  expect(
    await commitStoredAIOperation(speech, { kind: 'failure', reason: 'model-unavailable' }, 2000)
  ).toBe(true);
  expect(observation('text')?.status).toBe('available');
  expect(observation('speech')?.reason).toBe('model-unavailable');
  expect(observation('transcription')).toBeUndefined();
  expect(connection()).toBeUndefined();
});

it('preserves other models and a newer provider observation during parallel completion', async () => {
  await mutateStoredAISettings({ operation: 'add-model', model: { ...model, id: 'other' } });
  const first = await admit();
  const second = await admit('text', 'other');
  await commitStoredAIOperation(second, { kind: 'success' }, 2000);
  const providerBefore = connection();
  expect(await commitStoredAIOperation(first, { kind: 'success' }, 3000)).toBe(true);
  expect(connection()).toEqual(providerBefore);
  expect(observation('text', 'other')?.checkedAt).toBe(2000);
  expect(observation()?.checkedAt).toBe(3000);
});

it('rejects delayed deletion and same-ID recreation with a submitted generation', async () => {
  const receipt = await admit();
  const submitted = models()[0]!;
  await mutateStoredAISettings({ operation: 'delete-model', modelId: model.id });
  expect(await commitStoredAIOperation(receipt, { kind: 'success' }, 1000)).toBe(false);
  await mutateStoredAISettings({ operation: 'add-model', model: submitted });
  expect(models()[0]?.operationObservations).toBeUndefined();
  expect(await commitStoredAIOperation(receipt, { kind: 'success' }, 2000)).toBe(false);
});

it.each([false, true])(
  'invalidates a pending receipt after model update (code changes: %s)',
  async (changedCode) => {
    const receipt = await admit();
    await mutateStoredAISettings({
      operation: 'update-model',
      model: {
        ...models()[0]!,
        displayName: 'Edited',
        ...(changedCode ? { modelCode: 'changed' } : {}),
      },
    });
    expect(models()[0]?.operationObservations).toBeUndefined();
    expect(await commitStoredAIOperation(receipt, { kind: 'success' }, 1000)).toBe(false);
    expect(models()[0]?.displayName).toBe('Edited');
  }
);

it('rejects a delayed result after model-only portable restore', async () => {
  const receipt = await admit();
  await runWithExclusivePersistenceMutationPermit((permit) =>
    storage.local.set(
      { [AI_MODELS_KEY]: models().map(selectSettingsTransferModelMetadata) },
      permit
    )
  );
  expect(await commitStoredAIOperation(receipt, { kind: 'success' }, 1000)).toBe(false);
  expect(models()[0]?.operationObservations).toBeUndefined();
});

it('retains the record after refused publication and consumes an explicit retry once', async () => {
  const receipt = await admit();
  const before = structuredClone(models());
  storage.local.set.mockRejectedValueOnce(new Error('Storage refused'));
  await expect(commitStoredAIOperation(receipt, { kind: 'success' }, 1000)).rejects.toThrow(
    'Storage refused'
  );
  expect(models()).toEqual(before);
  expect(await commitStoredAIOperation(receipt, { kind: 'success' }, 2000)).toBe(true);
  expect(await commitStoredAIOperation(receipt, { kind: 'success' }, 3000)).toBe(false);
});

it('refuses stale code, disabled models and unsupported operations without writes', async () => {
  storage.local.set.mockClear();
  expect(await admitStoredAIOperation(await binding('text', model.id, 'stale'))).toBeNull();
  storage.state.local[AI_MODELS_KEY] = [{ ...model, enabled: false }];
  expect(await admitStoredAIOperation(await binding())).toBeNull();
  storage.state.local[AI_MODELS_KEY] = [{ ...model, capabilities: undefined }];
  expect(await admitStoredAIOperation(await binding('speech'))).toBeNull();
  expect(storage.local.set).not.toHaveBeenCalled();
});

it('retains provider revision, credential and erasure fences for model receipts', async () => {
  const receipt = await admit();
  await mutateStoredAISettings({ operation: 'clear-provider-secret', providerId: provider.id });
  expect(await commitStoredAIOperation(receipt, { kind: 'success' }, 1000)).toBe(false);
  resetStorageFixture();
  storage.state.local[AI_MODELS_KEY] = [{ ...model }];
  const next = await admit();
  storage.state.local = {};
  storage.local.set.mockClear();
  expect(await commitStoredAIOperation(next, { kind: 'success' }, 2000)).toBe(false);
  expect(storage.local.set).not.toHaveBeenCalled();
});
