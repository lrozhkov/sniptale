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
async function prepareCatalogCredential(admission: AICatalogRefreshAdmission): Promise<string> {
  const provider = await readAdmittedCatalogProvider(admission.token);
  if (!provider) throw new AIProviderRequestError('provider-unavailable');
  const definition = getAIProviderDefinition(provider.connectionType);
  if (!definition.available) throw new AIProviderRequestError('provider-unavailable');
  if (definition.catalog === 'none') throw new AIProviderRequestError('catalog-unsupported');
  const origin = `${new URL(provider.baseUrl).origin}/*`;
  if (!(await chrome.permissions.contains({ origins: [origin] })))
    throw new AIProviderRequestError('host-permission-required');
  if (definition.credential === 'none' && !provider.hasStoredApiKey) return '';
  const state = await readStoredAIProviderSecretStateForProvider(provider);
  if (state.status === 'locked') throw new AIProviderRequestError('secret-locked');
  if (state.status !== 'ok' || !state.secret)
    throw new AIProviderRequestError('invalid-credential');
  return state.secret;
}

// Advisory request coalescing lasts for one MV3 runtime.
// Persisted refresh generations remain authoritative after runtime restart.
const catalogService = createManagedCatalogService({
  readProviders: loadAIProviders,
  admit: admitStoredAICatalogRefresh,
  prepare: prepareCatalogCredential,
  beforeSend: async (admission) => {
    await prepareCatalogCredential(admission);
  },
  commit: commitStoredAICatalogRefresh,
});

/** Explicit Settings action. A failed check persists a safe observation and preserves configuration. */
export async function refreshProviderCatalog(providerId: string): Promise<void> {
  await initializeAiStorageAccess();
  await catalogService.refresh(providerId, true);
}

/** Explicit maintenance trigger from an active Settings or picker flow. Never requests a host grant or unlock. */
export async function refreshManagedProviderCatalogs(): Promise<void> {
  await initializeAiStorageAccess();
  const providers = await loadAIProviders();
  await Promise.all(
    providers
      .filter((provider) => provider.management === 'automatic' && provider.enabled !== false)
      .map((provider) => catalogService.refresh(provider.id))
  );
}
