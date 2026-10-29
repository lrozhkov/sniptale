import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIModel, AIProvider } from '../../../contracts/settings';
import {
  AI_PERSISTED_SCENARIOS,
  parseAIScenarioSelections,
  type AIPersistedScenario,
  type AIRememberScenarioSelectionInput,
} from '../../../contracts/settings/ai-catalog';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';
import { resolveAIScenarioModel } from '../../../features/ai/selection';
import { mergeChromeAiSelectorEntries } from '../../../features/ai/chrome/constants';
import {
  AI_CHROME_ENABLED_KEY,
  AI_MODELS_KEY,
  AI_PROVIDERS_KEY,
  AI_SCENARIO_SELECTIONS_KEY,
  AI_STORAGE_RESET_PHASE_KEY,
  AI_STORAGE_VERSION,
  AI_STORAGE_VERSION_KEY,
} from './constants';

const storage = vi.hoisted(() => {
  const state: Record<'local' | 'sync' | 'session', Record<string, unknown>> = {
    local: {},
    sync: {},
    session: {},
  };
  const area = (name: keyof typeof state) => ({
    get: vi.fn(async (keys: string | string[]) =>
      Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys])
          .filter((key) => Object.hasOwn(state[name], key))
          .map((key) => [key, state[name][key]])
      )
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(state[name], items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[name][key];
    }),
  });
  return { state, local: area('local'), sync: area('sync'), session: area('session') };
});
vi.mock('../infrastructure/browser-storage', async (original) => ({
  ...(await original()),
  browserStorage: storage,
}));

import { loadAIScenarioSelection } from './scenario-selections';
import { mutateStoredAISettings, resetAISettingsMutationQueueForTests } from './graph-mutations';
import { patchSettings } from '../settings';

const provider: AIProvider = {
  id: 'provider',
  name: 'Google',
  connectionType: 'google',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  hasStoredApiKey: false,
  createdAt: 1,
  incarnation: 'incarnation',
  management: 'automatic',
  enabled: true,
};
const models: AIModel[] = ['a-model', 'b-model'].map((code) => ({
  id: code,
  modelCode: code,
  displayName: code,
  providerId: provider.id,
  source: 'catalog',
  enabled: true,
  capabilities: {
    operations: { text: 'supported', transcription: 'supported', speech: 'supported' },
    input: { text: 'supported', audio: 'supported' },
    output: { text: 'supported', audio: 'supported' },
    features: {},
  },
}));
let binding: string;
function choice(scenario: AIPersistedScenario, index = 0): AIRememberScenarioSelectionInput {
  return {
    scenario,
    modelId: models[index]!.id,
    modelCode: models[index]!.modelCode,
    providerId: provider.id,
    destinationBinding: binding,
    source: 'explicit',
  };
}
function remember(scenario: AIPersistedScenario, index = 0) {
  return mutateStoredAISettings({
    operation: 'remember-scenario-selection',
    selection: choice(scenario, index),
  });
}
function selectorProviders() {
  return [{ ...provider, destinationKind: 'external' as const }];
}

beforeEach(async () => {
  vi.clearAllMocks();
  resetAISettingsMutationQueueForTests();
  storage.state.local = {
    [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    [AI_PROVIDERS_KEY]: [{ ...provider }],
    [AI_MODELS_KEY]: models.map((model) => ({ ...model })),
  };
  storage.state.sync = {};
  storage.state.session = {};
  binding = await createAIProviderDestinationBinding(provider);
});

describe('scenario selection persistence', () => {
  it('merges parallel explicit choices for all non-voice scenarios without a global default', async () => {
    await Promise.all(
      AI_PERSISTED_SCENARIOS.map((scenario, index) => remember(scenario, index % 2))
    );
    for (const [index, scenario] of AI_PERSISTED_SCENARIOS.entries())
      expect(await loadAIScenarioSelection(scenario)).toMatchObject({
        modelId: models[index % 2]!.id,
        source: 'explicit',
        providerIncarnation: 'incarnation',
      });
    expect(storage.state.local).not.toHaveProperty('sniptale_ai_default_model');
  });

  it('does not write a first-use candidate or accepted project data while opening a reader', async () => {
    storage.state.local['accepted-project'] = {
      speech: 'saved-project-model',
      content: 'Keep accepted work',
    };
    const before = structuredClone(storage.state);
    expect(await loadAIScenarioSelection('video-speech')).toBeNull();
    expect(storage.state).toEqual(before);
    expect(storage.local.set).not.toHaveBeenCalled();
    expect(storage.sync.set).not.toHaveBeenCalled();
  });

  it('keeps the accepted choice after a failed write and permits a later retry', async () => {
    await remember('page-edit');
    storage.local.set.mockRejectedValueOnce(new Error('Storage refused'));
    await expect(remember('page-edit', 1)).rejects.toThrow('Storage refused');
    expect((await loadAIScenarioSelection('page-edit'))?.modelId).toBe('a-model');
    await remember('page-edit', 1);
    expect((await loadAIScenarioSelection('page-edit'))?.modelId).toBe('b-model');
  });

  it('preserves a deleted selection as unresolved and refuses a delayed choice for that model', async () => {
    await remember('page-edit');
    await mutateStoredAISettings({ operation: 'delete-model', modelId: 'a-model' });
    await expect(remember('page-edit')).rejects.toThrow('AI model selection changed');
    const selection = await loadAIScenarioSelection('page-edit');
    expect(selection?.modelId).toBe('a-model');
    expect(
      resolveAIScenarioModel({
        scenario: 'page-edit',
        models: models.slice(1),
        providers: selectorProviders(),
        selection,
      })
    ).toMatchObject({
      status: 'unavailable',
      modelId: null,
      previousSelection: { modelId: 'a-model' },
    });
  });

  it('rejects choices after provider recreation, credential change, disable, or reset admission', async () => {
    for (const changes of [
      { incarnation: 'replacement' },
      { credentialRevision: 2 },
      { enabled: false },
    ]) {
      storage.state.local[AI_PROVIDERS_KEY] = [{ ...provider, ...changes }];
      await expect(remember('page-edit')).rejects.toThrow('AI model selection changed');
    }
    storage.state.local[AI_PROVIDERS_KEY] = [provider];
    storage.state.local[AI_STORAGE_RESET_PHASE_KEY] = 'pending';
    await expect(remember('page-edit')).rejects.toThrow('AI model selection changed');
    expect(storage.state.local).not.toHaveProperty(AI_SCENARIO_SELECTIONS_KEY);
  });

  it('projects the accepted canonical voice preferences without creating duplicate records', async () => {
    const approved = {
      modelId: models[0]!.id,
      approvedProviderId: provider.id,
      approvedModelCode: models[0]!.modelCode,
      approvedDestination: binding,
    };
    await patchSettings({
      voiceInput: { transcription: approved, correction: { enabled: true, model: approved } },
    });
    expect(await loadAIScenarioSelection('voice-recognition')).toMatchObject({
      modelId: 'a-model',
      source: 'explicit',
    });
    expect(await loadAIScenarioSelection('voice-correction')).toMatchObject({
      modelId: 'a-model',
      source: 'explicit',
    });
    expect(storage.state.local).not.toHaveProperty(AI_SCENARIO_SELECTIONS_KEY);
    storage.state.local[AI_PROVIDERS_KEY] = [{ ...provider, incarnation: 'replacement' }];
    expect(await loadAIScenarioSelection('voice-correction')).toMatchObject({
      providerIncarnation: 'unresolved-voice-approval',
    });
  });

  it('filters invalid persisted entries and rejects duplicate voice authority', () => {
    expect(
      parseAIScenarioSelections({
        'voice-correction': { modelId: 'invalid' },
        'page-edit': { modelId: 'incomplete' },
        unknown: {},
      })
    ).toEqual({});
  });
});

describe('scenario resolution policy', () => {
  it('uses stable exact ID order only for a first-use candidate and never initializes voice scenarios', () => {
    expect(
      resolveAIScenarioModel({
        scenario: 'page-edit',
        models: [...models].reverse(),
        providers: selectorProviders(),
        selection: null,
      })
    ).toMatchObject({ status: 'initial', modelId: 'a-model' });
    expect(
      resolveAIScenarioModel({
        scenario: 'voice-correction',
        models,
        providers: selectorProviders(),
        selection: null,
      })
    ).toMatchObject({ status: 'empty', modelId: null });
  });

  it('requires reenable or explicit replacement of a disabled remembered model', async () => {
    await remember('page-edit');
    const selection = await loadAIScenarioSelection('page-edit');
    const disabled = models.map((model) =>
      model.id === 'a-model' ? { ...model, enabled: false } : model
    );
    expect(
      resolveAIScenarioModel({
        scenario: 'page-edit',
        models: disabled,
        providers: selectorProviders(),
        selection,
      })
    ).toMatchObject({ status: 'unavailable', modelId: null });
    expect(
      resolveAIScenarioModel({
        scenario: 'page-edit',
        models,
        providers: selectorProviders(),
        selection,
      })
    ).toMatchObject({ status: 'remembered', modelId: 'a-model' });
    expect(
      resolveAIScenarioModel({
        scenario: 'page-edit',
        models,
        providers: [{ ...selectorProviders()[0]!, incarnation: 'replacement' }],
        selection,
      })
    ).toMatchObject({ status: 'unavailable', modelId: null });
  });
});

it('restricts Chrome execution to supported content scenarios', () => {
  const chromeProvider = {
    id: 'chrome',
    name: 'Chrome',
    connectionType: 'chrome-built-in' as const,
    createdAt: 0,
    hasStoredApiKey: false,
    destinationKind: 'chrome-built-in' as const,
  };
  const model = {
    id: 'chrome-model',
    modelCode: 'chrome',
    displayName: 'Chrome AI',
    providerId: 'chrome',
  };
  expect(
    resolveAIScenarioModel({
      scenario: 'page-edit',
      models: [model],
      providers: [chromeProvider],
      selection: null,
    })
  ).toMatchObject({ status: 'initial', modelId: 'chrome-model' });
  expect(
    resolveAIScenarioModel({
      scenario: 'scenario-edit',
      models: [model],
      providers: [chromeProvider],
      selection: null,
    })
  ).toMatchObject({ status: 'empty', modelId: null });
});

it('remembers Chrome page editing through the existing writer and refuses use after disable', async () => {
  const chrome = mergeChromeAiSelectorEntries({ models: [], providers: [] });
  const model = chrome.models[0]!;
  storage.state.local[AI_CHROME_ENABLED_KEY] = true;
  const selection: AIRememberScenarioSelectionInput = {
    scenario: 'page-edit',
    modelId: model.id,
    modelCode: model.modelCode,
    providerId: model.providerId,
    source: 'explicit',
  };
  await mutateStoredAISettings({ operation: 'remember-scenario-selection', selection });
  const remembered = await loadAIScenarioSelection('page-edit');
  expect(remembered).toMatchObject({
    modelId: model.id,
    providerIncarnation: 'chrome-built-in',
    source: 'explicit',
  });
  storage.local.set.mockClear();
  expect(await loadAIScenarioSelection('page-edit')).toEqual(remembered);
  expect(storage.local.set).not.toHaveBeenCalled();
  storage.state.local[AI_CHROME_ENABLED_KEY] = false;
  await expect(
    mutateStoredAISettings({ operation: 'remember-scenario-selection', selection })
  ).rejects.toThrow();
  expect(await loadAIScenarioSelection('page-edit')).toEqual(remembered);
  expect(storage.local.set).not.toHaveBeenCalled();
  expect(
    resolveAIScenarioModel({
      scenario: 'page-edit',
      models,
      providers: selectorProviders(),
      selection: remembered,
    })
  ).toMatchObject({ status: 'unavailable', modelId: null });
});

it.each([
  { createdAt: 2, enabled: true, expected: 'new-model' },
  { createdAt: 1, enabled: true, expected: 'a-model' },
  { createdAt: 2, enabled: false, expected: 'a-model' },
])(
  'resolves connection recency without changing ties or eligibility: $createdAt/$enabled',
  ({ createdAt, enabled, expected }) => {
    const providers = [
      ...selectorProviders(),
      { ...selectorProviders()[0]!, id: 'new-provider', createdAt, enabled },
    ];
    const available = [...models, { ...models[0]!, id: 'new-model', providerId: 'new-provider' }];
    expect(
      resolveAIScenarioModel({
        scenario: 'page-edit',
        models: available,
        providers,
        selection: null,
      })
    ).toMatchObject({ status: 'initial', modelId: expected });
    expect(
      resolveAIScenarioModel({
        scenario: 'voice-recognition',
        models: available,
        providers,
        selection: null,
      })
    ).toMatchObject({ status: 'empty', modelId: null });
    expect(
      resolveAIScenarioModel({
        scenario: 'page-edit',
        models: available,
        providers,
        selection: null,
        preferredProviderId: provider.id,
      })
    ).toMatchObject({ status: 'initial', modelId: 'a-model' });
  }
);

it('retains connection order when the latest connection has no compatible model', () => {
  const providers = [
    ...selectorProviders(),
    { ...selectorProviders()[0]!, id: 'new-provider', createdAt: 2 },
  ];
  expect(
    resolveAIScenarioModel({ scenario: 'page-edit', models, providers, selection: null })
  ).toMatchObject({ status: 'initial', modelId: 'a-model' });
});

it('keeps a remembered identity unresolved instead of replacing it with a newer connection', async () => {
  await remember('page-edit');
  const selection = await loadAIScenarioSelection('page-edit');
  const providers = [
    { ...selectorProviders()[0]!, enabled: false },
    { ...selectorProviders()[0]!, id: 'new-provider', createdAt: 2 },
  ];
  const available = [...models, { ...models[0]!, id: 'new-model', providerId: 'new-provider' }];
  expect(
    resolveAIScenarioModel({ scenario: 'page-edit', models: available, providers, selection })
  ).toMatchObject({ status: 'unavailable', modelId: null, previousSelection: selection });
});
