import type { AIModel } from '../../contracts/settings';

export function resolveSelectedAIModelId(
  models: AIModel[],
  storedDefaultModelId: string | null
): string | null {
  if (storedDefaultModelId && models.some((model) => model.id === storedDefaultModelId)) {
    return storedDefaultModelId;
  }

  return models[0]?.id ?? null;
}

export async function reconcileSelectedAIModelId(
  models: AIModel[],
  storedDefaultModelId: string | null
): Promise<string | null> {
  return resolveSelectedAIModelId(models, storedDefaultModelId);
}
