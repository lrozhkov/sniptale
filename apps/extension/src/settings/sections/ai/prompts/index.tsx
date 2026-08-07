import { DelayedSettingsCenteredLoadingState } from '../../../section-surface/loading-state';
import { translate } from '../../../../platform/i18n';
import { useAiPromptsController } from './controller';
import { AiPromptsContent } from './surface/content';
import { TemplatesSection } from './templates';

export function AIPromptsSection() {
  const state = useAiPromptsController();
  if (state.isLoading) return <DelayedSettingsCenteredLoadingState />;
  return (
    <div className="space-y-8">
      {state.error ? (
        <p role="alert" className="text-sm text-[var(--sniptale-color-danger)]">
          {translate('common.states.error')}
          {translate('settings.aiProviders.loadErrorSuffix')}
        </p>
      ) : (
        <AiPromptsContent prompts={state.prompts} />
      )}
      <TemplatesSection />
    </div>
  );
}
