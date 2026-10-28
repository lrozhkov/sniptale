import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import { getAIProviderOperations } from '../../../../../contracts/settings/ai-provider';
import {
  getAIModelLifecycle,
  supportsAIProviderModelOperation,
} from '../../../../../contracts/settings/model-operation';
import { formatDateTime, formatNumber, translate } from '../../../../../platform/i18n';

export function ProviderCatalogDetails(props: {
  provider: AIProvider;
  models: AIModel[];
  onConfigureModel: () => void;
}) {
  const { provider } = props;
  const models = props.models.filter((model) => model.providerId === provider.id);
  const operations = getAIProviderOperations(provider.connectionType);
  const eligibleCount = models.filter((model) =>
    operations.some((operation) => supportsAIProviderModelOperation(model, provider, operation))
  ).length;
  const incompleteMetadata = models.some(
    (model) =>
      model.source === 'catalog' &&
      model.enabled !== false &&
      (getAIModelLifecycle(model.catalog) === 'active' ||
        getAIModelLifecycle(model.catalog) === 'deprecated') &&
      operations.every(
        (operation) => model.catalog?.capabilities.operations[operation] !== 'supported'
      ) &&
      operations.some((operation) => {
        const support = model.catalog?.capabilities.operations[operation];
        return support === undefined || support === 'unknown';
      })
  );
  const date = (timestamp: number) =>
    formatDateTime(timestamp, { dateStyle: 'short', timeStyle: 'short' });
  return (
    <div className="space-y-1 text-xs text-[var(--sniptale-color-text-muted)]">
      {provider.management === 'automatic' ? (
        <>
          <p>
            {translate('settings.aiProviders.providerEligibleModels').replace(
              '{count}',
              formatNumber(eligibleCount)
            )}
          </p>
          <p>
            {provider.catalogUpdatedAt === undefined
              ? translate('settings.aiProviders.providerCatalogNeverUpdated')
              : translate('settings.aiProviders.providerCatalogUpdated').replace(
                  '{date}',
                  date(provider.catalogUpdatedAt)
                )}
          </p>
          {incompleteMetadata ? (
            <>
              <p>{translate('settings.aiProviders.providerCatalogMetadataMissing')}</p>
              <ProductActionButton compact tone="secondary" onClick={props.onConfigureModel}>
                {translate('settings.aiProviders.providerConfigureModel')}
              </ProductActionButton>
            </>
          ) : null}
        </>
      ) : null}
      {provider.observation ? (
        <p>
          {translate('settings.aiProviders.providerChecked').replace(
            '{date}',
            date(provider.observation.checkedAt)
          )}
        </p>
      ) : null}
    </div>
  );
}
