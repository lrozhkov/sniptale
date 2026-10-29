import {
  filterChromeAiSelectorEntries,
  isChromeAiModelId,
  isChromeAiProviderId,
} from '../../../../../../../features/ai/chrome/constants';
import type { AIModel, AIProvider } from '../../../../../../../contracts/settings';
import type { AISecretProtectionStatusPayload } from '../../../../../../../contracts/messaging/ai-settings-runtime';
import { requestAISettingsPageRuntimeData } from '../../../../../../../workflows/ai-settings/query';

export type LoadedAiProvidersRuntimeData = [
  AIProvider[],
  AIModel[],
  AIProvider[],
  AIModel[],
  string,
  string,
  boolean,
  AISecretProtectionStatusPayload,
];

export async function loadAiProvidersRuntimeData() {
  const runtimeData = await requestAISettingsPageRuntimeData();
  const { secretProtectionStatus, selectionBootstrap } = runtimeData;

  return [
    filterChromeAiSelectorEntries(selectionBootstrap.providers, (provider) =>
      isChromeAiProviderId(provider.id)
    ),
    filterChromeAiSelectorEntries(
      selectionBootstrap.models,
      (model) => isChromeAiModelId(model.id) || model.source === 'catalog'
    ),
    selectionBootstrap.providers,
    selectionBootstrap.models,
    selectionBootstrap.globalSystemPrompt,
    runtimeData.scenarioEditorSystemPrompt,
    selectionBootstrap.chromeAiEnabled,
    secretProtectionStatus,
  ] as LoadedAiProvidersRuntimeData;
}
