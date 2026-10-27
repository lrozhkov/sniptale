import { beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { parseSettingsTransferDomains } from '../../../workflows/settings-transfer/domain-parser';
import { emptySummary } from '../../../workflows/settings-transfer/planner';
import { createDefaultSettings } from '../settings';
import { applySettingsTransferDomains } from './apply';

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
vi.mock('../settings', async (original) => ({
  ...(await original<typeof import('../settings')>()),
  loadSettings: mocks.loadSettings,
}));
vi.mock('../capture-settings', () => ({
  loadVideoSettings: async () => structuredClone(DEFAULT_VIDEO_SETTINGS),
}));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.loadSettings.mockResolvedValue(createDefaultSettings());
  mocks.localGet.mockResolvedValue({});
  mocks.localSet.mockResolvedValue(undefined);
  mocks.localRemove.mockResolvedValue(undefined);
  mocks.syncSet.mockResolvedValue(undefined);
});

function modelConfigurationFixture() {
  return {
    id: 'configured',
    providerId: 'provider-a',
    modelCode: 'exact/code',
    displayName: 'Configured',
    source: 'manual',
    propertySource: 'catalog',
    enabled: false,
    retirementOverride: false,
    capabilities: {
      operations: { text: 'supported', transcription: 'supported', speech: 'supported' },
      input: { text: 'supported', audio: 'supported' },
      output: { audio: 'supported' },
      features: {},
    },
    audio: {
      transcription: { language: 'en', responseFormat: 'json', timestampGranularity: 'none' },
      speech: { voiceId: 'voice', responseFormat: 'mp3' },
    },
  };
}

it('applies model properties and both audio parameter blocks through domain admission', async () => {
  const model = modelConfigurationFixture();
  const domains = parseSettingsTransferDomains({
    'ai.models': { schemaVersion: 1, data: { items: [model], defaultModelId: null } },
  });
  await applySettingsTransferDomains({ domains, summary: emptySummary() });
  expect(mocks.localSet).toHaveBeenCalledWith(
    {
      sniptale_ai_models: [model],
      sniptale_ai_default_model: null,
    },
    undefined
  );
});

it('refuses malformed capabilities before any transfer write', async () => {
  const model = {
    ...modelConfigurationFixture(),
    capabilities: { operations: { speech: 'sometimes' } },
  };
  await expect(
    applySettingsTransferDomains({
      domains: { 'ai.models': { schemaVersion: 1, data: { items: [model] } } },
      summary: emptySummary(),
    })
  ).rejects.toThrow('Invalid settings transfer AI model metadata');
  expect(mocks.localSet).not.toHaveBeenCalled();
  expect(mocks.syncSet).not.toHaveBeenCalled();
});

it('restores model configuration after a refused import write', async () => {
  const previous = {
    ...modelConfigurationFixture(),
    displayName: 'Previous name',
    propertySource: 'manual',
  };
  const stored: Record<string, unknown> = {
    sniptale_ai_models: [previous],
    sniptale_ai_default_model: null,
  };
  const before = structuredClone(stored);
  mocks.localGet.mockImplementation(async (keys: string[]) =>
    Object.fromEntries(
      keys.filter((key) => key in stored).map((key) => [key, structuredClone(stored[key])])
    )
  );
  let refuse = true;
  mocks.localSet.mockImplementation(async (values: Record<string, unknown>) => {
    Object.assign(stored, structuredClone(values));
    if (refuse) {
      refuse = false;
      throw new Error('Storage refused after publication');
    }
  });
  mocks.localRemove.mockImplementation(async (keys: string[]) => {
    for (const key of keys) delete stored[key];
  });
  const model = modelConfigurationFixture();
  const domains = parseSettingsTransferDomains({
    'ai.models': { schemaVersion: 1, data: { items: [model], defaultModelId: null } },
  });
  await expect(applySettingsTransferDomains({ domains, summary: emptySummary() })).rejects.toThrow(
    'Storage refused after publication'
  );
  expect(stored).toEqual(before);
  await applySettingsTransferDomains({ domains, summary: emptySummary() });
  expect(stored['sniptale_ai_models']).toEqual([model]);
});

it('applies provider management and disabled configuration without imported local authority', async () => {
  const provider = {
    id: 'provider-a',
    name: 'Provider',
    connectionType: 'openai-compatible',
    baseUrl: 'https://example.com/v1',
    createdAt: 1,
    management: 'manual',
    enabled: false,
  };
  const domains = parseSettingsTransferDomains({
    'ai.providers': { schemaVersion: 1, data: { items: [provider] } },
  });
  await applySettingsTransferDomains({ domains, summary: emptySummary() });
  expect(mocks.localSet).toHaveBeenCalledWith(
    {
      sniptale_ai_providers: [{ ...provider, hasStoredApiKey: false }],
      sniptale_ai_provider_secrets: {},
    },
    undefined
  );
});
