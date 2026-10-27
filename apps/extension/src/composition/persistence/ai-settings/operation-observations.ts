import type { AIProvider } from '../../../contracts/settings';
import type {
  AIConnectionObservation,
  AIConnectionReason,
} from '../../../contracts/settings/ai-catalog';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';
import { browserStorage } from '../infrastructure/browser-storage';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  AI_PROVIDERS_KEY,
  AI_STORAGE_RESET_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';
import { parseStoredAIProviders } from './guards';

/** Stable non-secret authority captured by the existing model resolver. */
export interface AIOperationObservationBinding {
  providerId: string;
  incarnation: string;
  revision: number;
  credentialRevision: number;
  destination: string;
}
export interface AIOperationObservationToken extends AIOperationObservationBinding {
  generation: string;
}
export type AIOperationObservationOutcome =
  | { kind: 'success' }
  | { kind: 'failure'; reason: AIConnectionReason };

const CONNECTION_FAILURES: readonly AIConnectionReason[] = [
  'invalid-credential',
  'quota-exceeded',
  'rate-limited',
  'network',
  'timeout',
  'service-error',
  'provider-unavailable',
];

async function readOperationState() {
  const state = await browserStorage.local.get([
    AI_PROVIDERS_KEY,
    AI_STORAGE_VERSION_KEY,
    AI_STORAGE_RESET_PHASE_KEY,
  ]);
  return {
    ready:
      state[AI_STORAGE_VERSION_KEY] === AI_STORAGE_VERSION &&
      state[AI_STORAGE_RESET_PHASE_KEY] === undefined,
    providers: parseStoredAIProviders(state[AI_PROVIDERS_KEY]).value,
  };
}
async function matchesBinding(
  provider: AIProvider | undefined,
  binding: AIOperationObservationBinding
): Promise<boolean> {
  return (
    provider !== undefined &&
    provider.enabled !== false &&
    provider.incarnation === binding.incarnation &&
    (provider.revision ?? 0) === binding.revision &&
    (provider.credentialRevision ?? 0) === binding.credentialRevision &&
    (await createAIProviderDestinationBinding(provider)) === binding.destination
  );
}

/** The graph queue calls admission under its existing exclusive persistence permit. */
export async function admitOperationObservation(
  binding: AIOperationObservationBinding,
  permit: PersistenceMutationPermit
): Promise<AIOperationObservationToken | null> {
  const state = await readOperationState();
  const provider = state.providers.find((entry) => entry.id === binding.providerId);
  if (!state.ready || !(await matchesBinding(provider, binding))) return null;
  const generation = crypto.randomUUID();
  await browserStorage.local.set(
    {
      [AI_PROVIDERS_KEY]: state.providers.map((entry) =>
        entry.id === binding.providerId ? { ...entry, operationGeneration: generation } : entry
      ),
    },
    permit
  );
  return { ...binding, generation };
}

/** Advisory metadata never initializes erased storage or establishes model-wide availability. */
export async function commitOperationObservation(
  receipt: AIOperationObservationToken,
  outcome: AIOperationObservationOutcome,
  now: number,
  permit: PersistenceMutationPermit
): Promise<boolean> {
  if (outcome.kind === 'failure' && !CONNECTION_FAILURES.includes(outcome.reason)) return false;
  const state = await readOperationState();
  const provider = state.providers.find((entry) => entry.id === receipt.providerId);
  if (
    !state.ready ||
    !provider ||
    provider.operationGeneration !== receipt.generation ||
    !(await matchesBinding(provider, receipt))
  )
    return false;
  const observation: AIConnectionObservation =
    outcome.kind === 'success'
      ? {
          status: 'available',
          scope: 'operation',
          checkedAt: now,
          revision: receipt.revision,
          lastSuccessAt: now,
        }
      : {
          status: 'unavailable',
          scope: 'operation',
          checkedAt: now,
          revision: receipt.revision,
          reason: outcome.reason,
          ...(provider.observation?.lastSuccessAt !== undefined
            ? { lastSuccessAt: provider.observation.lastSuccessAt }
            : {}),
        };
  await browserStorage.local.set(
    {
      [AI_PROVIDERS_KEY]: state.providers.map((entry) =>
        entry.id === provider.id ? { ...entry, operationGeneration: undefined, observation } : entry
      ),
    },
    permit
  );
  return true;
}
