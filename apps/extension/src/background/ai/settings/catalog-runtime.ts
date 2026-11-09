import {
  SecretProtectionLockedError,
  type SecretProtectionPort,
} from '../../../composition/persistence/secret-protection/model';
import {
  initializeAiStorageAccess,
  loadAIProviders,
} from '../../../composition/persistence/ai-settings';
import {
  admitStoredAICatalogRefresh,
  commitStoredAICatalogRefresh,
} from '../../../composition/persistence/ai-settings/graph-mutations';
import {
  readAdmittedCatalogProvider,
  type AICatalogRefreshAdmission,
} from '../../../composition/persistence/ai-settings/managed-catalog';
import { readStoredAIProviderSecretStateForProvider } from '../../../composition/persistence/ai-settings/provider-secrets.store';
import { getAIProviderDefinition } from '../../../contracts/settings/ai-provider';
import { AIProviderRequestError } from '../providers';
import { createManagedCatalogService } from './managed-catalog';

/** Validate identity, permission and an already available credential immediately before metadata egress. */
async function prepareCatalogCredential(
  admission: AICatalogRefreshAdmission,
  protection?: SecretProtectionPort
): Promise<string> {
  const provider = await readAdmittedCatalogProvider(admission.token);
  if (!provider) throw new AIProviderRequestError('provider-unavailable');
  const definition = getAIProviderDefinition(provider.connectionType);
  if (!definition.available) throw new AIProviderRequestError('provider-unavailable');
  if (definition.catalog === 'none') throw new AIProviderRequestError('catalog-unsupported');
  const origin = `${new URL(provider.baseUrl).origin}/*`;
  if (!(await chrome.permissions.contains({ origins: [origin] })))
    throw new AIProviderRequestError('host-permission-required');
  if (definition.credential === 'none' && !provider.hasStoredApiKey) return '';
  let state: Awaited<ReturnType<typeof readStoredAIProviderSecretStateForProvider>>;
  try {
    state = protection
      ? await protection.withAdmission('ai', (key, permit) =>
          readStoredAIProviderSecretStateForProvider(provider, key, permit)
        )
      : await readStoredAIProviderSecretStateForProvider(provider);
  } catch (error) {
    if (error instanceof SecretProtectionLockedError)
      throw new AIProviderRequestError('secret-locked');
    throw error;
  }
  if (state.status === 'locked') throw new AIProviderRequestError('secret-locked');
  if (state.status !== 'ok' || !state.secret)
    throw new AIProviderRequestError('invalid-credential');
  return state.secret;
}

/** Construct one advisory catalog lifetime with the caller's credential authority. */
export function createAICatalogRuntime(protection?: SecretProtectionPort) {
  const catalogService = createManagedCatalogService({
    readProviders: loadAIProviders,
    admit: admitStoredAICatalogRefresh,
    prepare: (admission) => prepareCatalogCredential(admission, protection),
    beforeSend: async (admission) => {
      await prepareCatalogCredential(admission, protection);
    },
    commit: commitStoredAICatalogRefresh,
  });
  return {
    async refreshProviderCatalog(providerId: string): Promise<void> {
      await initializeAiStorageAccess();
      await catalogService.refresh(providerId, true);
    },
    async refreshManagedProviderCatalogs(): Promise<void> {
      await initializeAiStorageAccess();
      const providers = await loadAIProviders();
      await Promise.all(
        providers
          .filter((provider) => provider.management === 'automatic' && provider.enabled !== false)
          .map((provider) => catalogService.refresh(provider.id))
      );
    },
  };
}

// Existing transparent callers retain advisory coalescing, but gain no shared session authority.
const transparentCatalogRuntime = createAICatalogRuntime();
export const refreshProviderCatalog = transparentCatalogRuntime.refreshProviderCatalog;
export const refreshManagedProviderCatalogs =
  transparentCatalogRuntime.refreshManagedProviderCatalogs;
