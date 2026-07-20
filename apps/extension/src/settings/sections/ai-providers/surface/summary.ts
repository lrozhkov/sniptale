import { translate } from '../../../../platform/i18n';

export function getAiProvidersPromptDisclosureSummary(prompt: string) {
  const trimmedPrompt = prompt.trim();

  if (trimmedPrompt.length === 0) {
    return translate('settings.aiProviders.globalPromptEmptySummary');
  }

  return [
    translate('settings.aiProviders.globalPromptSavedSummaryPrefix'),
    String(trimmedPrompt.length),
  ].join(' ');
}
