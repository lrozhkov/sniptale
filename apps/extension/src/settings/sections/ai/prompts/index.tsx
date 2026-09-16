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
  const view =
    props.view === 'prompts' || props.view === 'scenario-templates' ? props.view : 'templates';
  return (
    <div className="space-y-5">
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.navigation.aiPrompts')}
        items={[
          { id: 'templates', label: translate('scenario.editor.guidePageTemplates') },
          { id: 'scenario-templates', label: translate('scenario.editor.guideScenarioTemplates') },
          { id: 'prompts', label: translate('settings.navigation.views.prompts') },
        ]}
        onChange={props.onViewChange}
      />
      {view === 'prompts' ? (
        <PromptsSubpage />
      ) : (
        <TemplatesSection key={view} scope={view === 'scenario-templates' ? 'scenario' : 'page'} />
      )}
    </div>
  );
}
