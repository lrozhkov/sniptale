import { DelayedSettingsCenteredLoadingState } from '../../../section-surface/loading-state';
import { translate } from '../../../../platform/i18n';
import { SettingsSubpageTabs } from '../../../section-surface';
import { useAiPromptsController } from './controller';
import { AiPromptsContent } from './surface/content';
import { TemplatesSection } from './templates';

function PromptsSubpage() {
  const state = useAiPromptsController();
  if (state.isLoading) return <DelayedSettingsCenteredLoadingState />;
  return state.error ? (
    <p role="alert" className="text-sm text-[var(--sniptale-color-danger)]">
      {translate('common.states.error')}
      {translate('settings.aiProviders.loadErrorSuffix')}
    </p>
  ) : (
    <AiPromptsContent prompts={state.prompts} />
  );
}

export function AIPromptsSection(props: { onViewChange?: (view: string) => void; view?: string }) {
  const view = props.view === 'prompts' ? 'prompts' : 'templates';
  return (
    <div className="space-y-5">
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.navigation.aiPrompts')}
        items={[
          { id: 'templates', label: translate('settings.navigation.views.templates') },
          { id: 'prompts', label: translate('settings.navigation.views.prompts') },
        ]}
        onChange={props.onViewChange}
      />
      {view === 'prompts' ? <PromptsSubpage /> : <TemplatesSection />}
    </div>
  );
}
