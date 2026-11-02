import { SettingsSubpageTabs, settingsSectionClassName } from '../../../../section-surface';
import { translate } from '../../../../../platform/i18n';
import { AIProvidersModelsCard } from './models-card';
import { AIProvidersProvidersCard } from './cards';
import type { AiProvidersSectionState } from '../controller/types';
import { AIProvidersChromeAiCard } from './chrome-ai-card';
import { AIProvidersSectionModals } from './modals';
import { SettingsSecretProtectionParticipantSummary } from '../../../../secret-protection/context';

type AiConnectionsView = 'integrations' | 'chrome-ai';

function resolveView(view: string | undefined): AiConnectionsView {
  return view === 'chrome-ai' ? view : 'integrations';
}

export function AIProvidersSectionContent(props: {
  state: AiProvidersSectionState;
  view?: string;
  onViewChange?: (view: string) => void;
}) {
  const { state } = props;
  const activeView = resolveView(props.view);

  return (
    <div className={settingsSectionClassName}>
      <SettingsSubpageTabs
        activeId={activeView}
        ariaLabel={translate('settings.aiProviders.tabsLabel')}
        items={[
          { id: 'integrations', label: translate('settings.aiProviders.integrationsTab') },
          { id: 'chrome-ai', label: translate('settings.aiProviders.chromeAiTab') },
        ]}
        onChange={props.onViewChange}
      />
      {activeView === 'integrations' ? (
        <div className="space-y-6">
          <SettingsSecretProtectionParticipantSummary participant="ai" />
          <AIProvidersProvidersCard state={state} />
          <AIProvidersModelsCard state={state} />
        </div>
      ) : null}
      {activeView === 'chrome-ai' ? <AIProvidersChromeAiCard state={state} /> : null}
      <AIProvidersSectionModals state={state} />
    </div>
  );
}
