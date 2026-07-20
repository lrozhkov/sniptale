import type { AIModel } from '../../../../../../contracts/settings';
import { reconcileSelectedAIModelId } from '../../../../../../features/ai/selection';

export async function ensureDefaultAiProvidersModel(
  loadedDefaultId: string | null,
  loadedModels: AIModel[],
  setDefaultModelId: (value: string | null) => void
) {
  const selectedModelId = await reconcileSelectedAIModelId(loadedModels, loadedDefaultId);

  if (selectedModelId === loadedDefaultId) {
    return;
  }

  setDefaultModelId(selectedModelId);
}
