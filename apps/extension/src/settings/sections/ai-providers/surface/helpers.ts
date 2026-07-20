import { translate } from '../../../../platform/i18n';
import type { AIModel } from '../../../../contracts/settings';
import type { AiProvidersDeleteState } from '../controller/types';

export function getAiProviderDeleteMessage(confirmDelete: NonNullable<AiProvidersDeleteState>) {
  return confirmDelete.type === 'provider'
    ? [
        translate('settings.aiProviders.deleteProviderMessagePrefix'),
        confirmDelete.item.name,
        translate('settings.aiProviders.deleteProviderMessageSuffix'),
      ].join('')
    : [
        translate('settings.aiProviders.deleteModelMessagePrefix'),
        confirmDelete.item.displayName,
        translate('settings.aiProviders.deleteModelMessageSuffix'),
      ].join('');
}

export function getAiModelPromptLabel(model: AIModel) {
  return model.systemPrompt
    ? [
        translate('settings.aiProviders.modelPromptOverriddenPrefix'),
        String(model.systemPrompt.length),
        translate('settings.aiProviders.modelPromptOverriddenSuffix'),
      ].join('')
    : translate('settings.aiProviders.modelPromptInherited');
}
