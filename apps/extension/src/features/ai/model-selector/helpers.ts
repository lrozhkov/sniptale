import type { AIModel } from '../../../contracts/settings';

export type AIModelSelectorProvider = {
  id: string;
  name: string;
};

type FilteredAIProviderGroup = {
  models: AIModel[];
  provider: AIModelSelectorProvider;
};

function getAIProviderName(providers: AIModelSelectorProvider[], providerId: string): string {
  return providers.find((provider) => provider.id === providerId)?.name || 'Unknown';
}

export function getSelectedAIModelLabel(
  models: AIModel[],
  providers: AIModelSelectorProvider[],
  selectedModelId: string | null
): string | null {
  const selectedModel = models.find((model) => model.id === selectedModelId);
  if (!selectedModel) {
    return null;
  }

  return `${getAIProviderName(providers, selectedModel.providerId)} / ${selectedModel.displayName}`;
}

export function getFilteredAIProviders(
  providers: AIModelSelectorProvider[],
  models: AIModel[],
  searchQuery: string
): FilteredAIProviderGroup[] {
  const normalizedQuery = searchQuery.toLowerCase();

  return providers
    .map((provider) => ({
      provider,
      models: models.filter((model) => {
        if (model.providerId !== provider.id) {
          return false;
        }

        return (
          searchQuery === '' ||
          model.displayName.toLowerCase().includes(normalizedQuery) ||
          provider.name.toLowerCase().includes(normalizedQuery)
        );
      }),
    }))
    .filter((entry) => entry.models.length > 0);
}
