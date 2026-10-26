import type { AIProvider } from '../../../contracts/settings';
import type {
  AIConnectionObservation,
  AIConnectionReason,
} from '../../../contracts/settings/ai-catalog';
import { isAICatalogFacts } from '../../../contracts/settings/ai-catalog';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';
import { browserStorage } from '../infrastructure/browser-storage';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { loadSettings } from '../settings';
import {
  AI_MODELS_KEY,
  AI_PROVIDERS_KEY,
  AI_SCENARIO_SELECTIONS_KEY,
  AI_STORAGE_RESET_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';
import { parseStoredAIModels, parseStoredAIProviders } from './guards';
import { reconcileManagedCatalog, type CatalogModelObservation } from './catalog-reconciliation';

const REFRESH_PERIOD_MS = 24 * 60 * 60 * 1000;
const FAILED_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

export interface AICatalogRefreshToken {
  providerId: string;
  incarnation: string;
  revision: number;
  credentialRevision: number;
  generation: string;
  scope: string;
}
export interface AICatalogRefreshAdmission {
  provider: AIProvider;
  token: AICatalogRefreshToken;
}
export type AICatalogRefreshOutcome =
  | { kind: 'catalog'; models: CatalogModelObservation[]; complete: boolean }
  | {
      kind: 'failure';
      reason: AIConnectionReason;
      status?: 'unavailable' | 'permission-required' | 'locked' | 'unverified';
    };

async function readCatalogState() {
  const state = await browserStorage.local.get([
    AI_STORAGE_VERSION_KEY,
    AI_STORAGE_RESET_PHASE_KEY,
    AI_PROVIDERS_KEY,
    AI_MODELS_KEY,
    AI_SCENARIO_SELECTIONS_KEY,
  ]);
  const ready =
    state[AI_STORAGE_VERSION_KEY] === AI_STORAGE_VERSION &&
    state[AI_STORAGE_RESET_PHASE_KEY] === undefined;
  return {
    ready,
    providers: parseStoredAIProviders(state[AI_PROVIDERS_KEY]).value,
    models: parseStoredAIModels(state[AI_MODELS_KEY]).value,
    selections: state[AI_SCENARIO_SELECTIONS_KEY],
  };
}

/** Called only by the serialized graph owner under an exclusive persistence permit. */
export async function admitCatalogRefresh(
  providerId: string,
  explicit: boolean,
  now: number,
  permit: PersistenceMutationPermit
): Promise<AICatalogRefreshAdmission | null> {
  const state = await readCatalogState();
  const provider = state.providers.find((entry) => entry.id === providerId);
  if (!state.ready || !provider?.incarnation || provider.enabled === false) return null;
  if (
    !explicit &&
    (provider.management !== 'automatic' ||
      now - (provider.catalogUpdatedAt ?? -Infinity) < REFRESH_PERIOD_MS ||
      now - (provider.lastRefreshAttemptAt ?? -Infinity) < FAILED_REFRESH_COOLDOWN_MS)
  )
    return null;
  const generation = crypto.randomUUID();
  const token: AICatalogRefreshToken = {
    providerId,
    incarnation: provider.incarnation,
    revision: provider.revision ?? 0,
    credentialRevision: provider.credentialRevision ?? 0,
    generation,
    scope: await createAIProviderDestinationBinding(provider),
  };
  const next = { ...provider, lastRefreshAttemptAt: now, refreshGeneration: generation };
  await browserStorage.local.set(
    {
      [AI_PROVIDERS_KEY]: state.providers.map((entry) => (entry.id === providerId ? next : entry)),
    },
    permit
  );
  return { provider: next, token };
}

function referencedModels(selections: unknown): Set<string> {
  const ids = new Set<string>();
  if (typeof selections !== 'object' || selections === null || Array.isArray(selections))
    return ids;
  const values: unknown[] = Object.values(selections);
  for (const value of values) {
    if (
      typeof value === 'object' &&
      value !== null &&
      'modelId' in value &&
      typeof value.modelId === 'string'
    )
      ids.add(value.modelId);
  }
  return ids;
}

function matchesToken(
  provider: AIProvider | undefined,
  token: AICatalogRefreshToken
): provider is AIProvider {
  return (
    provider !== undefined &&
    provider.enabled !== false &&
    provider.incarnation === token.incarnation &&
    (provider.revision ?? 0) === token.revision &&
    (provider.credentialRevision ?? 0) === token.credentialRevision &&
    provider.refreshGeneration === token.generation
  );
}

async function reconcileCatalogModels(
  state: Awaited<ReturnType<typeof readCatalogState>>,
  token: AICatalogRefreshToken,
  outcome: Extract<AICatalogRefreshOutcome, { kind: 'catalog' }>,
  now: number
) {
  if (
    outcome.models.length > 10000 ||
    new Set(outcome.models.map((entry) => entry.modelCode)).size !== outcome.models.length ||
    outcome.models.some(
      (entry) =>
        !entry.modelCode.trim() || entry.modelCode.length > 500 || !isAICatalogFacts(entry.facts)
    )
  )
    throw new Error('Invalid AI catalog observation');
  const referencedModelIds = referencedModels(state.selections);
  const settings = await loadSettings();
  if (settings.voiceInput?.transcription)
    referencedModelIds.add(settings.voiceInput.transcription.modelId);
  if (settings.voiceInput?.correction?.model)
    referencedModelIds.add(settings.voiceInput.correction.model.modelId);
  const reconciled = reconcileManagedCatalog({
    providerId: token.providerId,
    scope: token.scope,
    models: state.models,
    observations: outcome.models,
    complete: outcome.complete,
    now,
    referencedModelIds,
    createId: () => crypto.randomUUID(),
  });
  return {
    models: reconciled.models,
    changed: reconciled.added + reconciled.updated + reconciled.deleted > 0,
  };
}

/** Reject delayed results after replacement, restore, erasure, key rotation, or a newer refresh. */
export async function commitCatalogRefresh(
  token: AICatalogRefreshToken,
  outcome: AICatalogRefreshOutcome,
  now: number,
  permit: PersistenceMutationPermit
): Promise<boolean> {
  const state = await readCatalogState();
  const provider = state.providers.find((entry) => entry.id === token.providerId);
  if (
    !state.ready ||
    !matchesToken(provider, token) ||
    (await createAIProviderDestinationBinding(provider)) !== token.scope
  )
    return false;
  const { models, changed } =
    outcome.kind === 'catalog'
      ? await reconcileCatalogModels(state, token, outcome, now)
      : { models: state.models, changed: false };
  const observation: AIConnectionObservation =
    outcome.kind === 'catalog'
      ? {
          status: 'available',
          scope: 'catalog',
          checkedAt: now,
          revision: token.revision,
          lastSuccessAt: now,
        }
      : {
          status: outcome.status ?? 'unavailable',
          scope: 'catalog',
          checkedAt: now,
          revision: token.revision,
          reason: outcome.reason,
          ...(provider.observation?.lastSuccessAt !== undefined
            ? { lastSuccessAt: provider.observation.lastSuccessAt }
            : {}),
        };
  const next = {
    ...provider,
    refreshGeneration: undefined,
    observation,
    ...(outcome.kind === 'catalog' && outcome.complete ? { catalogUpdatedAt: now } : {}),
  };
  await browserStorage.local.set(
    {
      [AI_PROVIDERS_KEY]: state.providers.map((entry) => (entry.id === provider.id ? next : entry)),
      ...(changed ? { [AI_MODELS_KEY]: models } : {}),
    },
    permit
  );
  return true;
}

/** Read current refresh authority without initialization, secret activation, or persistent writes. */
export async function readAdmittedCatalogProvider(
  token: AICatalogRefreshToken
): Promise<AIProvider | null> {
  const state = await readCatalogState();
  const provider = state.providers.find((entry) => entry.id === token.providerId);
  return state.ready &&
    matchesToken(provider, token) &&
    (await createAIProviderDestinationBinding(provider)) === token.scope
    ? provider
    : null;
}
