import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { emptySummary } from '../../../workflows/settings-transfer/planner';
import { applySettingsTransferDomains } from './apply';
import { createDefaultSettings } from '../settings';
const mocks = vi.hoisted(() => ({
  localGet: vi.fn(),
  localSet: vi.fn(),
  localRemove: vi.fn(),
  syncSet: vi.fn(),
  loadSettings: vi.fn(),
}));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    local: { get: mocks.localGet, set: mocks.localSet, remove: mocks.localRemove },
    sync: { get: async () => ({}), set: mocks.syncSet, remove: vi.fn() },
  },
}));
vi.mock('../settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../capture-settings', () => ({
  loadVideoSettings: async () => structuredClone(DEFAULT_VIDEO_SETTINGS),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSettings.mockResolvedValue(createDefaultSettings());
  mocks.localGet.mockResolvedValue({});
  mocks.localSet.mockResolvedValue(undefined);
  mocks.syncSet.mockResolvedValue(undefined);
});

it('keeps local microphone and model choices when importing transferable voice controls', async () => {
  const transcription = {
    modelId: 'asr',
    approvedProviderId: 'provider',
    approvedDestination: `sha256:${'a'.repeat(64)}`,
    approvedModelCode: 'whisper',
  };
  mocks.loadSettings.mockResolvedValue({
    ...createDefaultSettings(),
    voiceInput: {
      language: 'ru-RU',
      mode: 'local-first',
      microphoneDeviceId: 'local-device',
      backend: 'model',
      transcription,
      correction: { enabled: false, model: null },
    },
  });
  await applySettingsTransferDomains({
    domains: {
      'system.voice': { schemaVersion: 1, data: { language: 'en-US', mode: 'local-first' } },
    },
    summary: emptySummary(),
  });
  expect(mocks.syncSet).toHaveBeenCalledWith(
    {
      sniptale_settings: expect.objectContaining({
        voiceInput: {
          language: 'en-US',
          mode: 'local-first',
          microphoneDeviceId: 'local-device',
          backend: 'model',
          transcription,
          correction: { enabled: false, model: null },
        },
      }),
    },
    undefined
  );
});
it('restores local voice correction instructions after a partially failed import', async () => {
  vi.clearAllMocks();
  const key = 'sniptale_ai_voice_input_correction_prompt';
  mocks.localGet.mockResolvedValue({ [key]: 'Before' });
  mocks.localSet
    .mockRejectedValueOnce(new Error('partial correction write'))
    .mockResolvedValue(undefined);
  await expect(
    applySettingsTransferDomains({
      domains: { 'ai.prompts': { schemaVersion: 1, data: { voiceCorrection: 'After' } } },
      summary: emptySummary(),
    })
  ).rejects.toThrow('partial correction write');
  expect(mocks.localSet).toHaveBeenCalledWith({ [key]: 'After' }, undefined);
  expect(mocks.localSet).toHaveBeenLastCalledWith({ [key]: 'Before' }, undefined);
});
