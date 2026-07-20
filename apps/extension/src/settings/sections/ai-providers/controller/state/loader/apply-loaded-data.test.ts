import { expect, it, vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../../../../contracts/settings';
import { applyLoadedAiProvidersRuntimeData } from './apply-loaded-data';
import type { LoadedAiProvidersRuntimeData } from './runtime-data';

const PROVIDER: AIProvider = {
  id: 'provider-1',
  name: 'Ollama local',
  connectionType: 'openai-compatible',
  baseUrl: 'http://127.0.0.1:11434/v1',
  hasStoredApiKey: true,
  createdAt: 1,
};

const MODELS: AIModel[] = [
  {
    id: 'model-1',
    providerId: 'provider-1',
    modelCode: 'llama3.2',
    displayName: 'Llama 3.2',
    systemPrompt: '',
  },
  {
    id: 'model-2',
    providerId: 'provider-1',
    modelCode: 'phi4',
    displayName: 'Phi 4',
    systemPrompt: '',
  },
];

const SECRET_PROTECTION_STATUS = {
  isEnabled: true,
  isUnlocked: false,
  mode: 'passphrase' as const,
};

const LOADED_RUNTIME_DATA: LoadedAiProvidersRuntimeData = [
  [PROVIDER],
  MODELS,
  [PROVIDER],
  MODELS,
  'model-2',
  'Global',
  'Scenario',
  true,
  SECRET_PROTECTION_STATUS,
];

it('applies loaded runtime data to the ai providers state setters', () => {
  const setChromeAiEnabled = vi.fn();
  const setDefaultModelId = vi.fn();
  const setGlobalPromptState = vi.fn();
  const setModels = vi.fn();
  const setProviders = vi.fn();
  const setSelectionState = vi.fn();
  const setScenarioEditorPromptState = vi.fn();
  const setSecretProtectionStatus = vi.fn();

  const result = applyLoadedAiProvidersRuntimeData(
    {
      setChromeAiEnabled,
      setDefaultModelId,
      setGlobalPromptState,
      setModels,
      setProviders,
      setSelectionState,
      setScenarioEditorPromptState,
      setSecretProtectionStatus,
    },
    LOADED_RUNTIME_DATA
  );

  expect(result).toEqual({
    loadedDefaultId: 'model-2',
    loadedModels: MODELS,
  });
  expect(setProviders).toHaveBeenCalledWith([PROVIDER]);
  expect(setModels).toHaveBeenCalledWith(MODELS);
  expect(setSelectionState).toHaveBeenCalledWith({
    models: MODELS,
    providers: [PROVIDER],
  });
  expect(setDefaultModelId).toHaveBeenCalledWith('model-2');
  expect(setGlobalPromptState).toHaveBeenCalledWith('Global');
  expect(setScenarioEditorPromptState).toHaveBeenCalledWith('Scenario');
  expect(setChromeAiEnabled).toHaveBeenCalledWith(true);
  expect(setSecretProtectionStatus).toHaveBeenCalledWith(SECRET_PROTECTION_STATUS);
});
