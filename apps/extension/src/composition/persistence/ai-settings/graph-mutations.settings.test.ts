import { beforeEach, expect, it, vi } from 'vitest';

const coreMocks = vi.hoisted(() => ({
  changeAISecretPassphraseProtection: vi.fn(),
  disableAISecretPassphraseProtection: vi.fn(),
  enableAISecretPassphraseProtection: vi.fn(),
  loadAISecretProtectionStatus: vi.fn(),
  lockAISecretProtection: vi.fn(),
  resetAudioTranscriptionSystemPrompt: vi.fn(),
  saveAudioTranscriptionSystemPrompt: vi.fn(),
  saveVoiceInputCorrectionSystemPrompt: vi.fn(),
  resetVoiceInputCorrectionSystemPrompt: vi.fn(),
  resetGlobalSystemPrompt: vi.fn(),
  resetAISecretPassphraseProtection: vi.fn(),
  resetScenarioEditorSystemPrompt: vi.fn(),
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
  await mutateStoredAISettings({ operation: 'reset-global-prompt' });
  await mutateStoredAISettings({ operation: 'reset-scenario-editor-prompt' });
  await mutateStoredAISettings({ enabled: true, operation: 'save-chrome-ai-enabled' });
  await mutateStoredAISettings({
    operation: 'change-secret-passphrase-protection',
    currentPassphrase: 'current',
    nextPassphrase: 'next',
  });
  await mutateStoredAISettings({ operation: 'lock-secret-passphrase-protection' });

  expect(coreMocks.saveGlobalSystemPrompt).toHaveBeenCalledWith('global');
  expect(coreMocks.saveScenarioEditorSystemPrompt).toHaveBeenCalledWith('scenario');
  expect(coreMocks.resetGlobalSystemPrompt).toHaveBeenCalledOnce();
  expect(coreMocks.resetScenarioEditorSystemPrompt).toHaveBeenCalledOnce();
  expect(coreMocks.saveChromeAiEnabled).toHaveBeenCalledWith(true);
  expect(coreMocks.changeAISecretPassphraseProtection).toHaveBeenCalledWith({
    currentPassphrase: 'current',
    nextPassphrase: 'next',
  });
  expect(coreMocks.lockAISecretProtection).toHaveBeenCalledOnce();
  expect(invariantMock).toHaveBeenCalledTimes(14);
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

it('keeps recognition prompt save/reset ordered with other AI settings mutations after failure', async () => {
  coreMocks.saveAudioTranscriptionSystemPrompt.mockRejectedValueOnce(new Error('write failed'));
  const failed = mutateStoredAISettings({
    operation: 'save-audio-transcription-prompt',
    prompt: 'new',
  });
  const reset = mutateStoredAISettings({ operation: 'reset-audio-transcription-prompt' });
  await expect(failed).rejects.toThrow('write failed');
  await reset;
  expect(coreMocks.resetAudioTranscriptionSystemPrompt).toHaveBeenCalledOnce();
  expect(coreMocks.saveAudioTranscriptionSystemPrompt.mock.invocationCallOrder[0]).toBeLessThan(
    coreMocks.resetAudioTranscriptionSystemPrompt.mock.invocationCallOrder[0]!
  );
});

it('orders correction prompt writes and permits an explicit retry after failure', async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  coreMocks.saveVoiceInputCorrectionSystemPrompt.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
    throw new Error('storage unavailable');
  });
  const first = mutateStoredAISettings({
    operation: 'save-voice-input-correction-prompt',
    prompt: 'First',
  });
  const rejected = expect(first).rejects.toThrow('storage unavailable');
  await entered.promise;
  const retry = mutateStoredAISettings({
    operation: 'save-voice-input-correction-prompt',
    prompt: 'Retry',
  });
  const reset = mutateStoredAISettings({ operation: 'reset-voice-input-correction-prompt' });
  expect(coreMocks.saveVoiceInputCorrectionSystemPrompt).toHaveBeenCalledTimes(1);
  expect(coreMocks.resetVoiceInputCorrectionSystemPrompt).not.toHaveBeenCalled();
  release.resolve();
  await rejected;
  await retry;
  await reset;
  expect(coreMocks.saveVoiceInputCorrectionSystemPrompt).toHaveBeenLastCalledWith('Retry');
  expect(coreMocks.saveVoiceInputCorrectionSystemPrompt.mock.invocationCallOrder[1]).toBeLessThan(
    coreMocks.resetVoiceInputCorrectionSystemPrompt.mock.invocationCallOrder[0]!
  );
});

it('preserves correction prompt queue order relative to unrelated settings commands', async () => {
  const commands: string[] = [];
  coreMocks.saveVoiceInputCorrectionSystemPrompt.mockImplementationOnce(async () => {
    commands.push('correction');
  });
  coreMocks.saveGlobalSystemPrompt.mockImplementationOnce(async () => {
    commands.push('global');
  });
  const correction = mutateStoredAISettings({
    operation: 'save-voice-input-correction-prompt',
    prompt: 'Correction',
  });
  const global = mutateStoredAISettings({ operation: 'save-global-prompt', prompt: 'Global' });
  await Promise.all([correction, global]);
  expect(commands).toEqual(['correction', 'global']);
});

it.each(['validation', 'save', 'reset'] as const)(
  'releases correction admission after %s failure so erasure and explicit retry can finish',
  async (failure) => {
    const { runWithPersistentDataErasureBarrier } =
      await import('../infrastructure/mutation-barrier');
    coreMocks.saveVoiceInputCorrectionSystemPrompt.mockResolvedValue(undefined);
    coreMocks.resetVoiceInputCorrectionSystemPrompt.mockResolvedValue(undefined);
    if (failure === 'validation') invariantMock.mockRejectedValueOnce(new Error('failed'));
    if (failure === 'save')
      coreMocks.saveVoiceInputCorrectionSystemPrompt.mockRejectedValueOnce(new Error('failed'));
    if (failure === 'reset')
      coreMocks.resetVoiceInputCorrectionSystemPrompt.mockRejectedValueOnce(new Error('failed'));
    await expect(
      mutateStoredAISettings(
        failure === 'reset'
          ? {
              operation: 'reset-voice-input-correction-prompt',
            }
          : { operation: 'save-voice-input-correction-prompt', prompt: 'First' }
      )
    ).rejects.toThrow('failed');
    await expect(runWithPersistentDataErasureBarrier(async () => 'verified')).resolves.toBe(
      'verified'
    );
    await mutateStoredAISettings({
      operation: 'save-voice-input-correction-prompt',
      prompt: 'Retry',
    });
    await mutateStoredAISettings({ operation: 'reset-voice-input-correction-prompt' });
    expect(coreMocks.saveVoiceInputCorrectionSystemPrompt).toHaveBeenLastCalledWith('Retry');
    expect(coreMocks.resetVoiceInputCorrectionSystemPrompt).toHaveBeenCalled();
  }
);

it('observes failed correction admission behind a busy queue and allows an explicit retry', async () => {
  const { installPersistenceLockManagerForTests } =
    await import('../infrastructure/mutation-barrier');
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  coreMocks.saveGlobalSystemPrompt.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
  });
  const previous = mutateStoredAISettings({ operation: 'save-global-prompt', prompt: 'Global' });
  await entered.promise;
  const validations = invariantMock.mock.calls.length;
  installPersistenceLockManagerForTests({
    request() {
      return Promise.reject(new Error('admission unavailable'));
    },
  });
  try {
    const refused = mutateStoredAISettings({
      operation: 'save-voice-input-correction-prompt',
      prompt: 'Refused',
    });
    const rejected = expect(refused).rejects.toThrow('admission unavailable');
    expect(coreMocks.saveVoiceInputCorrectionSystemPrompt).not.toHaveBeenCalled();
    expect(invariantMock).toHaveBeenCalledTimes(validations);
    release.resolve();
    await previous;
    await rejected;
    expect(coreMocks.saveVoiceInputCorrectionSystemPrompt).not.toHaveBeenCalled();
  } finally {
    release.resolve();
    installPersistenceLockManagerForTests(null);
  }
  await mutateStoredAISettings({
    operation: 'save-voice-input-correction-prompt',
    prompt: 'Retry',
  });
  expect(coreMocks.saveVoiceInputCorrectionSystemPrompt).toHaveBeenLastCalledWith('Retry');
});
