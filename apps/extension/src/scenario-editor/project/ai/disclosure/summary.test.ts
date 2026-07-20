import { expect, it } from 'vitest';
import type { AIProviderSelectorEntry } from '../../../../contracts/messaging/ai-settings-runtime';
import type { AIModel } from '../../../../contracts/settings';
import { createScenarioAiDisclosureSummary } from './summary';

const MODEL: AIModel = {
  displayName: 'Model',
  id: 'model-1',
  modelCode: 'model-code',
  providerId: 'provider-1',
};

function createProvider(destinationKind: AIProviderSelectorEntry['destinationKind']) {
  return {
    connectionType: 'openai-compatible',
    createdAt: 1,
    destinationKind,
    hasStoredApiKey: true,
    id: 'provider-1',
    name: 'Provider',
  } satisfies AIProviderSelectorEntry;
}

it('classifies scenario AI providers for outbound disclosure', () => {
  expect(
    createScenarioAiDisclosureSummary({
      contract: 'legacy',
      models: [MODEL],
      providers: [createProvider('external')],
      screenshotsCount: 1,
      selectedModelId: 'model-1',
    })
  ).toMatchObject({
    modelLabel: 'Model',
    providerKind: 'external',
    providerLabel: 'Provider',
    screenshotsCount: 1,
    structuredFieldKeys: expect.arrayContaining(['pageContext', 'targetMetadata']),
  });

  expect(
    createScenarioAiDisclosureSummary({
      contract: 'deck',
      models: [MODEL],
      providers: [createProvider('local-custom')],
      screenshotsCount: 0,
      selectedModelId: 'model-1',
    })
  ).toMatchObject({
    providerKind: 'local-custom',
    structuredFieldKeys: expect.arrayContaining(['deckOutline', 'selectedSlideCode']),
  });

  expect(
    createScenarioAiDisclosureSummary({
      contract: 'legacy',
      models: [MODEL],
      providers: [createProvider('external')],
      screenshotsCount: 0,
      selectedModelId: 'model-1',
    }).structuredFieldKeys
  ).not.toContain('attachments');
});
