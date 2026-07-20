import { DelayedSettingsCenteredLoadingState } from '../../section-surface/loading-state';

import { useAiProvidersSection } from './controller/useAiProvidersSection';
import { AIProvidersSectionContent } from './surface/content';

export function AIProvidersSection() {
  const state = useAiProvidersSection();

  if (state.isLoading) {
    return <DelayedSettingsCenteredLoadingState />;
  }

  return <AIProvidersSectionContent state={state} />;
}
