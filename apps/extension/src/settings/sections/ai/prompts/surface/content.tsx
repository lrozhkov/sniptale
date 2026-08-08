import { translate } from '../../../../../platform/i18n';
import { settingsPanelClassName, settingsSectionClassName } from '../../../../section-surface';
import type { AiProvidersPromptsState } from '../state/types';
import { AIProvidersPromptCard } from './prompt-card';

export function AiPromptsContent(props: { prompts: AiProvidersPromptsState }) {
  return (
    <div className={settingsSectionClassName}>
      <header>
        <h1 className="text-xl font-semibold text-[var(--sniptale-color-text-primary-strong)]">
          {translate('settings.navigation.aiPrompts')}
        </h1>
      </header>
      <section className={[settingsPanelClassName, 'space-y-6'].join(' ')}>
        <AIProvidersPromptCard
          prompt={props.prompts.global}
          descriptionKey="settings.aiProviders.globalPromptDescription"
          saveButtonKey="settings.aiProviders.globalPromptSaveButton"
        />
        <div className="border-t border-[var(--sniptale-color-border-soft)] pt-6">
          <h2 className="mb-3 text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {translate('settings.aiProviders.scenarioEditorPromptTitle')}
          </h2>
          <AIProvidersPromptCard
            prompt={props.prompts.scenarioEditor}
            descriptionKey="settings.aiProviders.scenarioEditorPromptDescription"
            saveButtonKey="settings.aiProviders.scenarioEditorPromptSaveButton"
          />
        </div>
      </section>
    </div>
  );
}
