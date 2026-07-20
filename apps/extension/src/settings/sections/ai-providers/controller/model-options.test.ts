import { expect, it } from 'vitest';

import { translate } from '../../../../platform/i18n';
import type { AIModel } from '../../../../contracts/settings';
import { buildAiProvidersModelOptions } from './model-options';

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

it('keeps model option labels stable', () => {
  expect(
    buildAiProvidersModelOptions({
      getProviderName: (providerId) => (providerId === 'provider-1' ? 'Ollama local' : 'Unknown'),
      models: MODELS,
    })
  ).toEqual([
    { value: '', label: translate('settings.aiProviders.defaultModelUnsetOption') },
    { value: 'model-1', label: 'Ollama local / Llama 3.2' },
    { value: 'model-2', label: 'Ollama local / Phi 4' },
  ]);
});
