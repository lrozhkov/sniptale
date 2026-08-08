import { settingsSectionClassName } from '../../../../section-surface';
import { AIProvidersModelsCard } from './models-card';
import { AIProvidersProvidersCard } from './cards';
import type { AiProvidersSectionState } from '../controller/types';
import { AIProvidersChromeAiCard } from './chrome-ai-card';
import { AIProvidersHeader } from './header';
import { AIProvidersSectionModals } from './modals';
import { AIProvidersSecretProtectionCard } from './secret-protection-card';
import { SecretProtectionDialog } from './secret-protection-dialog';

export function AIProvidersSectionContent(props: { state: AiProvidersSectionState }) {
  const { state } = props;

  return (
    <div className={settingsSectionClassName}>
      <AIProvidersHeader />
      <AIProvidersChromeAiCard state={state} />
      <AIProvidersSecretProtectionCard state={state} />
      <AIProvidersProvidersCard state={state} />
      <AIProvidersModelsCard state={state} />
      <AIProvidersSectionModals state={state} />
      <SecretProtectionDialog state={state.secretProtection} />
    </div>
  );
}
