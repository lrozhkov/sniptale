import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { emptySummary } from '../../../workflows/settings-transfer/planner';
import { applySettingsTransferDomains } from './apply';
const mocks = vi.hoisted(() => ({ localGet: vi.fn(), localSet: vi.fn(), localRemove: vi.fn() }));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    local: { get: mocks.localGet, set: mocks.localSet, remove: mocks.localRemove },
    sync: { get: async () => ({}), set: vi.fn(), remove: vi.fn() },
  },
}));
vi.mock('../settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../settings')>();
  return { ...actual, loadSettings: async () => actual.createDefaultSettings() };
});
vi.mock('../capture-settings', () => ({
  loadVideoSettings: async () => structuredClone(DEFAULT_VIDEO_SETTINGS),
}));

it('restores additional recognition instructions after a partially failed import', async () => {
  const key = 'sniptale_ai_audio_transcription_prompt';
  mocks.localGet.mockResolvedValue({ [key]: 'Before' });
  mocks.localSet
    .mockRejectedValueOnce(new Error('partial prompt write'))
    .mockResolvedValue(undefined);
  await expect(
    applySettingsTransferDomains({
      domains: { 'ai.prompts': { schemaVersion: 1, data: { recognition: 'After' } } },
      summary: emptySummary(),
    })
  ).rejects.toThrow('partial prompt write');
  expect(mocks.localSet).toHaveBeenCalledWith({ [key]: 'After' }, undefined);
  expect(mocks.localSet).toHaveBeenLastCalledWith({ [key]: 'Before' }, undefined);
});
