import { getAIModelLifecycle } from '../../../../../contracts/settings/model-operation';
import type { AIModel } from '../../../../../contracts/settings';
import type {
  AIModelCapabilities,
  AIModelOperation,
} from '../../../../../contracts/settings/ai-catalog';
import type { ModelFormData } from '../../../../../features/ai/schemas/ai-settings';

function legacyModelCapabilities(operation: AIModelOperation = 'text'): AIModelCapabilities {
  return {
    operations: { [operation]: 'supported' },
    input: operation === 'transcription' ? { audio: 'supported' } : { text: 'supported' },
    output: operation === 'speech' ? { audio: 'supported' } : { text: 'supported' },
    features: {},
  };
}

export function createModelDraft(model?: AIModel | null): ModelFormData {
  return {
    providerId: model?.providerId ?? '',
    displayName: model?.displayName ?? '',
    modelCode: model?.modelCode ?? '',
    systemPrompt: model?.systemPrompt ?? '',
    source: 'manual',
    propertySource: model?.propertySource ?? (model?.source === 'catalog' ? 'catalog' : 'manual'),
    capabilities: structuredClone(model?.capabilities ?? legacyModelCapabilities(model?.operation)),
    enabled: model?.enabled ?? true,
    retirementOverride: model?.retirementOverride ?? false,
    ...(model?.operation === undefined ? {} : { operation: model.operation }),
    ...(model?.audio === undefined ? {} : { audio: structuredClone(model.audio) }),
  };
}

export function clearModelIdentityClaims(draft: ModelFormData): ModelFormData {
  const { audio: _audio, ...rest } = draft;
  return {
    ...rest,
    propertySource: 'manual',
    retirementOverride: false,
    capabilities: { operations: {}, input: {}, output: {}, features: {} },
  };
}

export function applyCatalogModelDraft(draft: ModelFormData, model: AIModel): ModelFormData {
  if (!model.catalog) return draft;
  const { audio: previousAudio, ...rest } = draft;
  const capabilities = structuredClone(model.catalog.capabilities);
  const transcription =
    capabilities.operations.transcription === 'supported'
      ? previousAudio?.transcription
      : undefined;
  const speech = capabilities.operations.speech === 'supported' ? previousAudio?.speech : undefined;
  return {
    ...rest,
    providerId: model.providerId,
    modelCode: model.modelCode,
    displayName: model.catalog.displayName,
    source: 'manual',
    propertySource: 'catalog',
    capabilities,
    retirementOverride: false,
    ...(getAIModelLifecycle(model.catalog) === 'retired' ? { enabled: false } : {}),
    ...(transcription || speech
      ? { audio: { ...(transcription ? { transcription } : {}), ...(speech ? { speech } : {}) } }
      : {}),
  };
}

export function updateDraftCapabilities(
  draft: ModelFormData,
  capabilities: AIModelCapabilities
): ModelFormData {
  const { audio: previousAudio, ...rest } = draft;
  const transcription =
    capabilities.operations.transcription === 'supported'
      ? previousAudio?.transcription
      : undefined;
  const speech = capabilities.operations.speech === 'supported' ? previousAudio?.speech : undefined;
  return {
    ...rest,
    capabilities,
    ...(transcription || speech
      ? { audio: { ...(transcription ? { transcription } : {}), ...(speech ? { speech } : {}) } }
      : {}),
  };
}

export function getModelCatalogEntries(models: AIModel[], providerId: string): AIModel[] {
  const codes = new Set<string>();
  return models.flatMap((model) => {
    if (
      model.providerId !== providerId ||
      !model.catalog ||
      model.catalog.lifecycle === 'absent' ||
      model.catalog.lifecycle === 'unknown' ||
      codes.has(model.modelCode)
    )
      return [];
    codes.add(model.modelCode);
    return [
      {
        ...model,
        displayName: model.catalog.displayName,
        capabilities: model.catalog.capabilities,
      },
    ];
  });
}
