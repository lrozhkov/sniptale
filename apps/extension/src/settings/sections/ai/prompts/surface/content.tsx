import {
  settingsCompactWorkbenchClassName,
  settingsSectionClassName,
} from '../../../../section-surface';
import type { AiProvidersPromptsState } from '../state/types';
import { AIProvidersPromptCard } from './prompt-card';

export function AiPromptsContent(props: { prompts: AiProvidersPromptsState }) {
  return (
    <div className={`${settingsSectionClassName} ${settingsCompactWorkbenchClassName}`}>
      <section className="space-y-8">
        <AIProvidersPromptCard
          prompt={props.prompts.global}
          descriptionKey="settings.aiProviders.globalPromptDescription"
          titleKey="settings.aiProviders.globalPromptTitle"
        />
        <div>
          <AIProvidersPromptCard
            prompt={props.prompts.scenarioEditor}
            descriptionKey="settings.aiProviders.scenarioEditorPromptDescription"
            titleKey="settings.aiProviders.scenarioEditorPromptTitle"
          />
        </div>
      </section>
    </div>
  );
}
