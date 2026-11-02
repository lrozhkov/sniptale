import { SecretProtectionAdmissionPermit } from '../../../composition/persistence/secret-protection/model';
import type { SecretProtectionService } from '../../../composition/persistence/secret-protection/model';
import { beforeEach, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  mutateStoredAISettings: vi.fn(),
  resetAISettingsMutationQueueForTests: vi.fn(),
}));

vi.mock('../../../composition/persistence/ai-settings', () => storageMocks);
const catalogs = vi.hoisted(() => ({
  refreshProviderCatalog: vi.fn(),
  refreshManagedProviderCatalogs: vi.fn(),
}));
vi.mock('./catalog-runtime', () => catalogs);

import { mutateAiSettings, resetAiSettingsMutationQueueForTests } from './mutations';

beforeEach(() => {
  vi.clearAllMocks();
  catalogs.refreshProviderCatalog.mockResolvedValue(undefined);
  catalogs.refreshManagedProviderCatalogs.mockResolvedValue(undefined);
  storageMocks.mutateStoredAISettings.mockResolvedValue(undefined);
});

it('delegates the complete mutation command to the persistence authority', async () => {
  const message = {
    model: {
      displayName: 'Model 1',
      id: 'model-1',
      modelCode: 'model-code',
      providerId: 'provider-1',
    },
    operation: 'add-model',
    providerIncarnation: 'incarnation',
    type: 'AI_SETTINGS_MUTATION',
  } as const;

  await mutateAiSettings(message);

  expect(storageMocks.mutateStoredAISettings).toHaveBeenCalledWith(message);
});

it('delegates model reorder commands without changing their insertion target', async () => {
  const message = {
    beforeModelId: null,
    modelId: 'model-1',
    operation: 'move-model',
    type: 'AI_SETTINGS_MUTATION',
  } as const;

  await mutateAiSettings(message);

  expect(storageMocks.mutateStoredAISettings).toHaveBeenCalledWith(message);
});

it('delegates queue reset to the persistence authority', () => {
  resetAiSettingsMutationQueueForTests();

  expect(storageMocks.resetAISettingsMutationQueueForTests).toHaveBeenCalledOnce();
});

it('refreshes an automatic connection after its configuration is committed', async () => {
  const message = {
    type: 'AI_SETTINGS_MUTATION',
    operation: 'add-provider',
    provider: {
      id: 'provider',
      name: 'Provider',
      baseUrl: 'https://api.neuraldeep.ru/v1',
      connectionType: 'neuraldeep',
      management: 'automatic',
      createdAt: 1,
    },
  } as const;
  await mutateAiSettings(message);
  expect(storageMocks.mutateStoredAISettings).toHaveBeenCalledWith(message);
  expect(catalogs.refreshProviderCatalog).toHaveBeenCalledWith('provider');
  expect(storageMocks.mutateStoredAISettings.mock.invocationCallOrder[0]).toBeLessThan(
    catalogs.refreshProviderCatalog.mock.invocationCallOrder[0]!
  );
});

it('does not send maintenance commands to the durable graph mutation dispatcher', async () => {
  await mutateAiSettings({ type: 'AI_SETTINGS_MUTATION', operation: 'refresh-managed-catalogs' });
  expect(catalogs.refreshManagedProviderCatalogs).toHaveBeenCalledOnce();
  expect(storageMocks.mutateStoredAISettings).not.toHaveBeenCalled();
});

it('checks a newly configured provider when automatic management is supplied by the storage default', async () => {
  await mutateAiSettings({
    type: 'AI_SETTINGS_MUTATION',
    operation: 'add-provider',
    provider: {
      id: 'provider',
      name: 'Provider',
      baseUrl: 'https://api.neuraldeep.ru/v1',
      connectionType: 'neuraldeep',
      createdAt: 1,
    },
  });
  expect(catalogs.refreshProviderCatalog).toHaveBeenCalledWith('provider');
});

it('preserves successful connection setup when a later metadata status write fails', async () => {
  catalogs.refreshProviderCatalog.mockRejectedValueOnce(new Error('Metadata storage refused'));
  await expect(
    mutateAiSettings({
      type: 'AI_SETTINGS_MUTATION',
      operation: 'add-provider',
      provider: {
        id: 'provider',
        name: 'Provider',
        baseUrl: 'https://api.neuraldeep.ru/v1',
        connectionType: 'neuraldeep',
        createdAt: 1,
      },
    })
  ).resolves.toBeUndefined();
  expect(storageMocks.mutateStoredAISettings).toHaveBeenCalledOnce();
});

it('refreshes accepted activation after commit and preserves it when metadata fails', async () => {
  const message = {
    type: 'AI_SETTINGS_MUTATION',
    operation: 'set-provider-enabled',
    providerId: 'provider',
    providerIncarnation: 'incarnation',
    enabled: true,
  } as const;
  catalogs.refreshProviderCatalog.mockRejectedValueOnce(new Error('metadata refused'));
  await expect(mutateAiSettings(message)).resolves.toBeUndefined();
  expect(storageMocks.mutateStoredAISettings).toHaveBeenCalledWith(message);
  expect(catalogs.refreshProviderCatalog).toHaveBeenCalledWith('provider');
  expect(storageMocks.mutateStoredAISettings.mock.invocationCallOrder[0]).toBeLessThan(
    catalogs.refreshProviderCatalog.mock.invocationCallOrder[0]!
  );
  catalogs.refreshProviderCatalog.mockClear();
  await mutateAiSettings({ ...message, enabled: false });
  expect(catalogs.refreshProviderCatalog).not.toHaveBeenCalled();
  storageMocks.mutateStoredAISettings.mockRejectedValueOnce(new Error('provider unavailable'));
  await expect(mutateAiSettings(message)).rejects.toThrow('provider unavailable');
  expect(catalogs.refreshProviderCatalog).not.toHaveBeenCalled();
});

it('routes protection commands to the injected common service without AI core dispatch', async () => {
  const service: SecretProtectionService = {
    prepare: vi.fn(async () => undefined),
    enable: vi.fn(async () => undefined),
    disable: vi.fn(async () => undefined),
    unlock: vi.fn(async () => undefined),
    lock: vi.fn(async () => undefined),
    changePassphrase: vi.fn(async () => undefined),
    reset: vi.fn(async () => undefined),
    resetParticipant: vi.fn(async () => undefined),
    readPreparedStatus: vi.fn(async () => null),
    readStatus: vi.fn(async () => ({
      isEnabled: true,
      isUnlocked: true,
      mode: 'passphrase' as const,
      participants: { ai: true, webdav: true },
    })),
    getEpoch: vi.fn(async () => 1),
    readKey: vi.fn(async () => null),
    withAdmission: async (_participant, operation) =>
      SecretProtectionAdmissionPermit.run((permit) => operation(null, permit)),
    clearMemory: vi.fn(),
    reserveErasure: () => ({ prepare: async () => undefined, release: () => undefined }),
  };
  for (const command of [
    { operation: 'enable-secret-passphrase-protection', passphrase: 'enable' },
    { operation: 'disable-secret-passphrase-protection', passphrase: 'disable' },
    { operation: 'unlock-secret-passphrase-protection', passphrase: 'unlock' },
    {
      operation: 'change-secret-passphrase-protection',
      currentPassphrase: 'old',
      nextPassphrase: 'next',
    },
    { operation: 'lock-secret-passphrase-protection' },
    { operation: 'reset-secret-passphrase-protection' },
  ] as const)
    await mutateAiSettings({ ...command, type: 'AI_SETTINGS_MUTATION' }, service);
  await mutateAiSettings(
    {
      type: 'AI_SETTINGS_MUTATION',
      operation: 'enable-secret-passphrase-protection',
      participant: 'webdav',
    },
    service
  );
  await mutateAiSettings(
    {
      type: 'AI_SETTINGS_MUTATION',
      operation: 'disable-secret-passphrase-protection',
      participant: 'webdav',
    },
    service
  );
  expect(service.enable).toHaveBeenCalledWith('ai', 'enable');
  expect(service.enable).toHaveBeenCalledWith('webdav', undefined);
  expect(service.disable).toHaveBeenCalledWith('webdav', undefined);
  expect(service.disable).toHaveBeenCalledWith('ai', 'disable');
  expect(service.unlock).toHaveBeenCalledWith('unlock');
  expect(service.changePassphrase).toHaveBeenCalledWith({
    currentPassphrase: 'old',
    nextPassphrase: 'next',
  });
  expect(service.lock).toHaveBeenCalledOnce();
  expect(service.reset).toHaveBeenCalledOnce();
  expect(storageMocks.mutateStoredAISettings).not.toHaveBeenCalled();
});
