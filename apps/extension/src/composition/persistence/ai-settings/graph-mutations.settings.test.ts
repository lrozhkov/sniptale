import { beforeEach, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  changeAISecretPassphraseProtection: vi.fn(),
  disableAISecretPassphraseProtection: vi.fn(),
  enableAISecretPassphraseProtection: vi.fn(),
  loadAISecretProtectionStatus: vi.fn(),
  lockAISecretProtection: vi.fn(),
  resetAISecretPassphraseProtection: vi.fn(),
  saveChromeAiEnabled: vi.fn(),
  saveGlobalSystemPrompt: vi.fn(),
  saveScenarioEditorSystemPrompt: vi.fn(),
  unlockAISecretProtection: vi.fn(),
}));
const initializeMock = vi.hoisted(() => vi.fn());
const invariantMock = vi.hoisted(() => vi.fn());

vi.mock('./core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./core')>()),
  ...coreMocks,
}));
vi.mock('./graph-invariants', () => ({ assertAISettingsGraphInvariants: invariantMock }));
vi.mock('./init', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./init')>()),
  initializeAiStorageAccess: initializeMock,
}));

import {
  loadSerializedAISecretProtectionStatus,
  mutateStoredAISettings,
  resetAISettingsMutationQueueForTests,
} from './graph-mutations';

beforeEach(() => {
  vi.clearAllMocks();
  resetAISettingsMutationQueueForTests();
  initializeMock.mockResolvedValue(undefined);
  invariantMock.mockResolvedValue(undefined);
  coreMocks.loadAISecretProtectionStatus.mockResolvedValue({
    isEnabled: true,
    isUnlocked: true,
    mode: 'passphrase',
  });
});

it('dispatches value and secret-protection commands inside the same authority', async () => {
  await mutateStoredAISettings({ operation: 'save-global-prompt', prompt: 'global' });
  await mutateStoredAISettings({ operation: 'save-scenario-editor-prompt', prompt: 'scenario' });
  await mutateStoredAISettings({ enabled: true, operation: 'save-chrome-ai-enabled' });
  await mutateStoredAISettings({
    operation: 'change-secret-passphrase-protection',
    currentPassphrase: 'current',
    nextPassphrase: 'next',
  });
  await mutateStoredAISettings({ operation: 'lock-secret-passphrase-protection' });

  expect(coreMocks.saveGlobalSystemPrompt).toHaveBeenCalledWith('global');
  expect(coreMocks.saveScenarioEditorSystemPrompt).toHaveBeenCalledWith('scenario');
  expect(coreMocks.saveChromeAiEnabled).toHaveBeenCalledWith(true);
  expect(coreMocks.changeAISecretPassphraseProtection).toHaveBeenCalledWith({
    currentPassphrase: 'current',
    nextPassphrase: 'next',
  });
  expect(coreMocks.lockAISecretProtection).toHaveBeenCalledOnce();
  expect(invariantMock).toHaveBeenCalledTimes(10);
});

it('dispatches remaining secret-protection commands and returns serialized status', async () => {
  await mutateStoredAISettings({
    operation: 'enable-secret-passphrase-protection',
    passphrase: 'enable-passphrase',
  });
  await mutateStoredAISettings({
    operation: 'disable-secret-passphrase-protection',
    passphrase: 'disable-passphrase',
  });
  await mutateStoredAISettings({
    operation: 'unlock-secret-passphrase-protection',
    passphrase: 'unlock-passphrase',
  });
  await mutateStoredAISettings({ operation: 'reset-secret-passphrase-protection' });
  await expect(loadSerializedAISecretProtectionStatus()).resolves.toEqual({
    isEnabled: true,
    isUnlocked: true,
    mode: 'passphrase',
  });

  expect(coreMocks.enableAISecretPassphraseProtection).toHaveBeenCalledWith('enable-passphrase');
  expect(coreMocks.disableAISecretPassphraseProtection).toHaveBeenCalledWith('disable-passphrase');
  expect(coreMocks.unlockAISecretProtection).toHaveBeenCalledWith('unlock-passphrase');
  expect(coreMocks.resetAISecretPassphraseProtection).toHaveBeenCalledOnce();
  expect(coreMocks.loadAISecretProtectionStatus).toHaveBeenCalledOnce();
  expect(invariantMock).toHaveBeenCalledTimes(9);
});
