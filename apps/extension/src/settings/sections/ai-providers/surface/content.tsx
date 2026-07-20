import { useState } from 'react';

import { translate } from '../../../../platform/i18n';
import { settingsSectionClassName } from '../../../section-surface';
import { AIProvidersModelsCard } from './models-card';
import { AIProvidersProvidersCard } from './cards';
import type { AiProvidersSectionState } from '../controller/types';
import { AIProvidersChromeAiCard } from './chrome-ai-card';
import { AIProvidersHeader } from './header';
import { AIProvidersPromptCard } from './prompt-card';
import { AIProvidersPromptDisclosure } from './disclosure';
import { AIProvidersSectionModals } from './modals';
import { getAiProvidersPromptDisclosureSummary } from './summary';
import { AIProvidersSecretProtectionCard } from './secret-protection-card';
import { SecretProtectionDialog } from './secret-protection-dialog';

export function AIProvidersSectionContent(props: { state: AiProvidersSectionState }) {
  const { state } = props;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const globalPrompt = state.prompts.global;
  const scenarioEditorPrompt = state.prompts.scenarioEditor;

  return (
    <div className={settingsSectionClassName}>
      <AIProvidersHeader />
      <AIProvidersChromeAiCard state={state} />
      <AIProvidersSecretProtectionCard state={state} />
      <AIProvidersProvidersCard state={state} />
      <AIProvidersModelsCard state={state} />
      <AIProvidersPromptDisclosure
        advancedOpen={advancedOpen}
        setAdvancedOpen={setAdvancedOpen}
        summary={getAiProvidersPromptDisclosureSummary(globalPrompt.value)}
      >
        <div className="grid gap-6">
          <AIProvidersPromptCard
            prompt={globalPrompt}
            descriptionKey="settings.aiProviders.globalPromptDescription"
            saveButtonKey="settings.aiProviders.globalPromptSaveButton"
          />
          <div className="border-t border-[var(--sniptale-color-border-soft)] pt-6">
            <div className="mb-3">
              <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
                {translate('settings.aiProviders.scenarioEditorPromptTitle')}
              </div>
              <div className="mt-1 text-xs text-[var(--sniptale-color-text-dim)]">
                {getAiProvidersPromptDisclosureSummary(scenarioEditorPrompt.value)}
              </div>
            </div>
            <AIProvidersPromptCard
              prompt={scenarioEditorPrompt}
              descriptionKey="settings.aiProviders.scenarioEditorPromptDescription"
              saveButtonKey="settings.aiProviders.scenarioEditorPromptSaveButton"
            />
          </div>
        </div>
      </AIProvidersPromptDisclosure>
      <AIProvidersSectionModals state={state} />
      <SecretProtectionDialog state={state.secretProtection} />
    </div>
  );
}
