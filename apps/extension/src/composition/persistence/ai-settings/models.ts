import type { AIModel } from '../../../contracts/settings';
import { mutateStoredAISettings } from './graph-mutations';

export async function addAIModel(model: AIModel): Promise<void> {
  await mutateStoredAISettings({ model, operation: 'add-model' });
}

export async function updateAIModel(model: AIModel): Promise<void> {
  await mutateStoredAISettings({ model, operation: 'update-model' });
}

export async function deleteAIModel(modelId: string): Promise<void> {
  await mutateStoredAISettings({ modelId, operation: 'delete-model' });
}
