import { vi } from 'vitest';
import type { AIModel, AIProvider } from '../../../contracts/settings';
import type { AICatalogFacts } from '../../../contracts/settings/ai-catalog';
import {
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
  AI_MODELS_KEY,
  AI_PROVIDERS_KEY,
} from './constants';
import {
  isActivePersistenceMutationPermit,
  runWithPersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';

export const storage = (() => {
  const state: Record<'local' | 'sync' | 'session', Record<string, unknown>> = {
    local: {},
    sync: {},
    session: {},
  };
  const makeArea = (area: keyof typeof state) => ({
    get: vi.fn(async (keys: string | string[]) =>
      Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys])
          .filter((key) => Object.hasOwn(state[area], key))
          .map((key) => [key, state[area][key]])
      )
    ),
    set: vi.fn(async (items: Record<string, unknown>, permit?: unknown) => {
      const apply = () => {
        Object.assign(state[area], items);
      };
      if (isActivePersistenceMutationPermit(permit)) apply();
      else await runWithPersistenceMutationPermit(apply);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[area][key];
    }),
  });
  return { state, local: makeArea('local'), sync: makeArea('sync'), session: makeArea('session') };
})();

export const provider: AIProvider = {
  id: 'provider',
  name: 'Provider',
  connectionType: 'neuraldeep',
  baseUrl: 'https://api.neuraldeep.ru/v1',
  hasStoredApiKey: false,
  createdAt: 1,
  enabled: true,
  management: 'automatic',
  incarnation: 'incarnation',
  revision: 1,
  credentialRevision: 1,
};
export const facts: AICatalogFacts = {
  displayName: 'Catalog text',
  lifecycle: 'active',
  observedAt: 1000,
  capabilities: {
    operations: { text: 'supported' },
    input: { text: 'supported' },
    output: { text: 'supported' },
    features: {},
  },
};
export const catalog = {
  kind: 'catalog' as const,
  complete: true,
  models: [{ modelCode: 'exact-id', facts }],
};

export function models(): AIModel[] {
  return storage.state.local[AI_MODELS_KEY] as AIModel[];
}

export function resetStorageFixture(): void {
  storage.state.local = {
    [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    [AI_PROVIDERS_KEY]: [{ ...provider }],
    [AI_MODELS_KEY]: [],
  };
  storage.state.sync = {};
  storage.state.session = {};
}
