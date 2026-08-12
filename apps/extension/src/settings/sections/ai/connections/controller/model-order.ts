import { moveAIModel } from '../../../../runtime/ai-settings/mutations';
import { translate } from '../../../../../platform/i18n';
import { toast } from '@sniptale/ui/product-feedback/toast-service';

export function createAiProvidersModelMoveHandler(reloadData: () => Promise<void>) {
  let pendingMove: Promise<void> = Promise.resolve();

  return (modelId: string, beforeModelId: string | null): Promise<boolean> => {
    const operation = pendingMove.then(async () => {
      await moveAIModel(modelId, beforeModelId);
      await reloadData();
    });
    pendingMove = operation.catch(() => undefined);

    return operation.then(
      () => true,
      () => {
        toast.error(translate('settings.aiProviders.modelOrderSaveError'));
        return false;
      }
    );
  };
}
