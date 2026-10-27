import type { AIModel, AIProvider } from '../../../contracts/settings';
import type {
  AIConnectionObservation,
  AIConnectionReason,
  AIModelOperation,
} from '../../../contracts/settings/ai-catalog';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';
import { browserStorage } from '../infrastructure/browser-storage';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  AI_PROVIDERS_KEY,
  AI_MODELS_KEY,
  AI_STORAGE_RESET_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';
import { parseStoredAIModels, parseStoredAIProviders } from './guards';
import { supportsAIModelOperation } from '../../../contracts/settings/model-operation';

/** Stable non-secret authority captured by the existing model resolver. */
export interface AIOperationObservationBinding {
  model?: { id: string; code: string; operation: AIModelOperation } | undefined;
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
    AI_MODELS_KEY,
    AI_STORAGE_VERSION_KEY,
    AI_STORAGE_RESET_PHASE_KEY,
  ]);
  return {
    ready:
      state[AI_STORAGE_VERSION_KEY] === AI_STORAGE_VERSION &&
      state[AI_STORAGE_RESET_PHASE_KEY] === undefined,
    providers: parseStoredAIProviders(state[AI_PROVIDERS_KEY]).value,
    models: parseStoredAIModels(state[AI_MODELS_KEY]).value,
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

function boundModel(
  models: AIModel[],
  binding: AIOperationObservationBinding
): AIModel | undefined {
  const identity = binding.model;
  if (!identity) return undefined;
  return models.find(
    (entry) =>
      entry.id === identity.id &&
      entry.providerId === binding.providerId &&
      entry.modelCode === identity.code &&
      supportsAIModelOperation(entry, identity.operation)
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
  const identity = binding.model;
  const model = boundModel(state.models, binding);
  if (identity && !model) return null;
  const generation = crypto.randomUUID();
  await browserStorage.local.set(
    {
      [AI_PROVIDERS_KEY]: state.providers.map((entry) =>
        entry.id === binding.providerId ? { ...entry, operationGeneration: generation } : entry
      ),
      ...(model && identity
        ? {
            [AI_MODELS_KEY]: state.models.map((entry) =>
              entry.id === model.id
                ? {
                    ...entry,
                    operationObservations: {
                      ...entry.operationObservations,
                      [identity.operation]: {
                        ...entry.operationObservations?.[identity.operation],
                        generation,
                      },
                    },
                  }
                : entry
            ),
          }
        : {}),
    },
    permit
  );
  return { ...binding, generation };
}

function operationObservation(
  previous: AIConnectionObservation | undefined,
  revision: number,
  outcome: AIOperationObservationOutcome,
  now: number
): AIConnectionObservation {
  return outcome.kind === 'success'
    ? {
        status: 'available',
        scope: 'operation',
        checkedAt: now,
        revision,
        lastSuccessAt: now,
      }
    : {
        status: 'unavailable',
        scope: 'operation',
        checkedAt: now,
        revision,
        reason: outcome.reason,
        ...(previous?.lastSuccessAt !== undefined ? { lastSuccessAt: previous.lastSuccessAt } : {}),
      };
}

/** Advisory publication never initializes erased state or changes model eligibility. */
export async function commitOperationObservation(
  receipt: AIOperationObservationToken,
  outcome: AIOperationObservationOutcome,
  now: number,
  permit: PersistenceMutationPermit
): Promise<boolean> {
  const connectionOutcome =
    outcome.kind === 'success' || CONNECTION_FAILURES.includes(outcome.reason);
  const modelOutcome =
    outcome.kind === 'success' ||
    outcome.reason === 'model-unavailable' ||
    outcome.reason === 'permission-denied' ||
    connectionOutcome;
  if (!connectionOutcome && (!receipt.model || !modelOutcome)) return false;
  const state = await readOperationState();
  const provider = state.providers.find((entry) => entry.id === receipt.providerId);
  if (!state.ready || !provider || !(await matchesBinding(provider, receipt))) return false;
  const identity = receipt.model;
  const model = boundModel(state.models, receipt);
  if (
    identity &&
    (!model || model.operationObservations?.[identity.operation]?.generation !== receipt.generation)
  )
    return false;
  const currentProvider = provider.operationGeneration === receipt.generation;
  if (!identity && !currentProvider) return false;
  const writes: Record<string, unknown> = {};
  if (currentProvider) {
    const nextProvider = {
      ...provider,
      operationGeneration: undefined,
      ...(connectionOutcome
        ? {
            observation: operationObservation(provider.observation, receipt.revision, outcome, now),
          }
        : {}),
    };
    writes[AI_PROVIDERS_KEY] = state.providers.map((entry) =>
      entry.id === provider.id ? nextProvider : entry
    );
  }
  if (model && identity) {
    const observation = operationObservation(
      model.operationObservations?.[identity.operation]?.observation,
      receipt.revision,
      outcome,
      now
    );
    writes[AI_MODELS_KEY] = state.models.map((entry) =>
      entry.id === model.id
        ? {
            ...entry,
            operationObservations: {
              ...entry.operationObservations,
              [identity.operation]: { observation },
            },
          }
        : entry
    );
  }
  await browserStorage.local.set(writes, permit);
  return true;
}
