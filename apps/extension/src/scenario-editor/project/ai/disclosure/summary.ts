import type { AIProviderSelectorEntry } from '../../../../contracts/messaging/ai-settings-runtime';
import type { AIModel } from '../../../../contracts/settings';

export type ScenarioAiProviderKind = 'chrome-built-in' | 'external' | 'local-custom';
type ScenarioAiPayloadContract = 'deck' | 'legacy';

export interface ScenarioAiDisclosureSummary {
  modelLabel: string;
  providerKind: ScenarioAiProviderKind;
  providerLabel: string;
  screenshotsCount: number;
  structuredFieldKeys: readonly ScenarioAiStructuredFieldKey[];
}

export type ScenarioAiStructuredFieldKey =
  | 'attachments'
  | 'deckOutline'
  | 'instruction'
  | 'pageContext'
  | 'projectSnapshot'
  | 'selectedSlideCode'
  | 'stepContent'
  | 'targetMetadata'
  | 'toolManifest';

const LEGACY_STRUCTURED_FIELDS: readonly ScenarioAiStructuredFieldKey[] = [
  'instruction',
  'projectSnapshot',
  'pageContext',
  'targetMetadata',
  'stepContent',
  'attachments',
];

const DECK_STRUCTURED_FIELDS: readonly ScenarioAiStructuredFieldKey[] = [
  'instruction',
  'deckOutline',
  'selectedSlideCode',
  'toolManifest',
  'projectSnapshot',
];

export function createScenarioAiDisclosureSummary(args: {
  contract: ScenarioAiPayloadContract;
  models: readonly AIModel[];
  providers: readonly AIProviderSelectorEntry[];
  screenshotsCount: number;
  selectedModelId: string | null;
}): ScenarioAiDisclosureSummary {
  const model = args.models.find((candidate) => candidate.id === args.selectedModelId) ?? null;
  const provider = args.providers.find((candidate) => candidate.id === model?.providerId) ?? null;

  return {
    modelLabel: model?.displayName ?? args.selectedModelId ?? 'default',
    providerKind: classifyScenarioAiProvider(provider),
    providerLabel: provider?.name ?? 'default',
    screenshotsCount: args.screenshotsCount,
    structuredFieldKeys: resolveStructuredFieldKeys({
      contract: args.contract,
      screenshotsCount: args.screenshotsCount,
    }),
  };
}

function resolveStructuredFieldKeys(args: {
  contract: ScenarioAiPayloadContract;
  screenshotsCount: number;
}): readonly ScenarioAiStructuredFieldKey[] {
  if (args.contract === 'deck') {
    return DECK_STRUCTURED_FIELDS;
  }

  return args.screenshotsCount > 0
    ? LEGACY_STRUCTURED_FIELDS
    : LEGACY_STRUCTURED_FIELDS.filter((key) => key !== 'attachments');
}

function classifyScenarioAiProvider(
  provider: AIProviderSelectorEntry | null
): ScenarioAiProviderKind {
  if (provider?.connectionType === 'chrome-built-in') {
    return 'chrome-built-in';
  }

  if (provider?.destinationKind === 'local-custom') {
    return 'local-custom';
  }

  return 'external';
}
