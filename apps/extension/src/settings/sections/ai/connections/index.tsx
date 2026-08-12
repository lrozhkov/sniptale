import { DelayedSettingsCenteredLoadingState } from '../../../section-surface/loading-state';

import { useAiProvidersSection } from './controller/useAiProvidersSection';
import { AIProvidersSectionContent } from './surface/content';

export function AIProvidersSection(props: {
  onViewChange?: (view: string) => void;
  view?: string;
}) {
  const state = useAiProvidersSection();

  if (state.isLoading) {
    return <DelayedSettingsCenteredLoadingState />;
  }

  return (
    <AIProvidersSectionContent
      state={state}
      {...(props.view === undefined ? {} : { view: props.view })}
      {...(props.onViewChange === undefined ? {} : { onViewChange: props.onViewChange })}
    />
  );
}
