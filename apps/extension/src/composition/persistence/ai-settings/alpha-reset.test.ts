import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceProviderSelection } from '@sniptale/runtime-contracts/voice-input';
import type { AIModel, AIProvider } from '../../../contracts/settings';
import { createAIProviderDestinationBinding } from '../../../features/ai/egress-authority';
import {
  AI_CHROME_ENABLED_KEY,
  AI_DEFAULT_MODEL_KEY,
  AI_GLOBAL_PROMPT_KEY,
  AI_LOCAL_SECRET_KEY_STORAGE_KEY,
  AI_MODELS_KEY,
  AI_PROVIDER_SECRETS_KEY,
  AI_PROVIDERS_KEY,
  AI_SCENARIO_SELECTIONS_KEY,
  AI_SETTINGS_RESET_NOTICE_KEY,
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
  const makeArea = (area: keyof typeof state) => ({
    get: vi.fn(async (keys: string | string[]) =>
      Object.fromEntries(
        (Array.isArray(keys) ? keys : [keys])
          .filter((key) => Object.hasOwn(state[area], key))
          .map((key) => [key, state[area][key]])
      )
    ),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(state[area], items);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[area][key];
    }),
  });
  return { state, local: makeArea('local'), sync: makeArea('sync'), session: makeArea('session') };
});
vi.mock('../infrastructure/browser-storage', async (original) => ({
  ...(await original()),
  browserStorage: storage,
}));

import { resetIncompatibleAISettings } from './alpha-reset';
import { createDefaultSettings, loadSettings, patchSettings } from '../settings';
import { runWithExclusivePersistenceMutationPermit } from '../infrastructure/mutation-barrier';

const provider: AIProvider = {
  id: 'provider',
  name: 'Provider',
  connectionType: 'neuraldeep',
  baseUrl: 'https://api.neuraldeep.ru/v1',
  hasStoredApiKey: false,
  createdAt: 1,
  enabled: true,
  incarnation: 'incarnation',
  credentialRevision: 1,
};
const model: AIModel = {
  id: 'model',
  providerId: provider.id,
  displayName: 'Text',
  modelCode: 'exact-model-code',
  enabled: true,
  source: 'manual',
};
let selection: VoiceProviderSelection;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  vi.clearAllMocks();
  storage.state.local = {
    [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
    [AI_PROVIDERS_KEY]: [provider],
    [AI_MODELS_KEY]: [model],
  };
  storage.state.sync = { sniptale_settings: createDefaultSettings() };
  storage.state.session = {};
  selection = {
    modelId: model.id,
    approvedProviderId: provider.id,
    approvedModelCode: model.modelCode,
    approvedDestination: await createAIProviderDestinationBinding(provider),
  };
});

describe('explicit incompatible AI reset', () => {
  it('clears obsolete AI state and approvals while preserving preferences, prompts and unrelated data', async () => {
    storage.state.local[AI_STORAGE_VERSION_KEY] = 3;
    Object.assign(storage.state.local, {
      [AI_PROVIDER_SECRETS_KEY]: { obsolete: 'encrypted' },
      [AI_LOCAL_SECRET_KEY_STORAGE_KEY]: 'obsolete',
      [AI_DEFAULT_MODEL_KEY]: model.id,
      [AI_GLOBAL_PROMPT_KEY]: 'Keep authored instructions',
      unrelated_project: { accepted: 'Keep result' },
    });
    storage.state.session['sniptale_ai_passphrase_session_key_material'] = 'obsolete';
    storage.state.sync['sniptale_settings'] = {
      ...createDefaultSettings(),
      imageQuality: 79,
      apiKey: 'obsolete-plaintext',
      voiceInput: {
        language: 'en-US',
        microphoneDeviceId: 'microphone',
        mode: 'local-first',
        enabled: true,
        backend: 'model',
        transcription: selection,
        correction: { enabled: true, model: selection },
      },
    };
    await resetIncompatibleAISettings();
    expect(storage.state.local).toMatchObject({
      [AI_STORAGE_VERSION_KEY]: AI_STORAGE_VERSION,
      [AI_SETTINGS_RESET_NOTICE_KEY]: true,
      [AI_PROVIDERS_KEY]: [],
      [AI_MODELS_KEY]: [],
      [AI_SCENARIO_SELECTIONS_KEY]: {},
      [AI_CHROME_ENABLED_KEY]: false,
      [AI_GLOBAL_PROMPT_KEY]: 'Keep authored instructions',
      unrelated_project: { accepted: 'Keep result' },
    });
    expect(storage.state.local).not.toHaveProperty(AI_PROVIDER_SECRETS_KEY);
    expect(storage.state.local).not.toHaveProperty(AI_DEFAULT_MODEL_KEY);
    expect(storage.state.local).not.toHaveProperty(AI_LOCAL_SECRET_KEY_STORAGE_KEY);
    expect(storage.state.local).not.toHaveProperty(AI_STORAGE_RESET_PHASE_KEY);
    expect(storage.state.session).toEqual({});
    const settings = await loadSettings();
    expect(settings.imageQuality).toBe(79);
    expect(settings.voiceInput).toMatchObject({
      enabled: false,
      backend: 'model',
      language: 'en-US',
      microphoneDeviceId: 'microphone',
      transcription: null,
      correction: { enabled: false, model: null },
    });
    expect(storage.state.sync['sniptale_settings']).not.toHaveProperty('apiKey');
  });

  it('does not show an upgrade notice for a fresh installation', async () => {
    storage.state.local = {};
    await resetIncompatibleAISettings();
    expect(storage.state.local[AI_SETTINGS_RESET_NOTICE_KEY]).toBe(false);
  });

  it('keeps an interrupted reset closed and resumes it on retry', async () => {
    storage.state.local[AI_STORAGE_VERSION_KEY] = 3;
    storage.session.remove.mockRejectedValueOnce(new Error('Storage refused'));
    await expect(resetIncompatibleAISettings()).rejects.toThrow('Storage refused');
    expect(storage.state.local[AI_STORAGE_VERSION_KEY]).toBe(3);
    expect(storage.state.local[AI_STORAGE_RESET_PHASE_KEY]).toBe('reset-ai-settings-v4');
    await expect(
      patchSettings({ voiceInput: { correction: { enabled: true, model: selection } } })
    ).rejects.toThrow('AI model selection changed');
    await resetIncompatibleAISettings();
    expect(storage.state.local[AI_STORAGE_VERSION_KEY]).toBe(AI_STORAGE_VERSION);
    expect(storage.state.local).not.toHaveProperty(AI_STORAGE_RESET_PHASE_KEY);
  });

  it('coalesces concurrent reset effects under the persistence barrier', async () => {
    storage.state.local[AI_STORAGE_VERSION_KEY] = 3;
    await Promise.all([resetIncompatibleAISettings(), resetIncompatibleAISettings()]);
    expect(storage.sync.set).toHaveBeenCalledTimes(1);
    expect(storage.session.remove).toHaveBeenCalledTimes(1);
  });
});

describe('canonical voice selection authority', () => {
  it('saves selection and approval together and preserves them on unrelated patches', async () => {
    await patchSettings({ voiceInput: { correction: { enabled: true, model: selection } } });
    storage.state.local[AI_MODELS_KEY] = [];
    await patchSettings({ imageQuality: 72 });
    expect((await loadSettings()).voiceInput?.correction).toEqual({
      enabled: true,
      model: selection,
    });
  });

  it.each(['delete', 'disable', 'rotate', 'recreate', 'code'] as const)(
    'refuses a stale approval after %s',
    async (action) => {
      if (action === 'delete') storage.state.local[AI_MODELS_KEY] = [];
      if (action === 'disable')
        storage.state.local[AI_PROVIDERS_KEY] = [{ ...provider, enabled: false }];
      if (action === 'rotate')
        storage.state.local[AI_PROVIDERS_KEY] = [{ ...provider, credentialRevision: 2 }];
      if (action === 'recreate')
        storage.state.local[AI_PROVIDERS_KEY] = [{ ...provider, incarnation: 'replacement' }];
      if (action === 'code')
        storage.state.local[AI_MODELS_KEY] = [{ ...model, modelCode: 'different' }];
      await expect(
        patchSettings({ voiceInput: { correction: { enabled: true, model: selection } } })
      ).rejects.toThrow('AI model selection changed');
      expect(storage.sync.set).not.toHaveBeenCalled();
    }
  );

  it('does not resurrect a voice tuple queued after reset admission', async () => {
    storage.state.local[AI_STORAGE_VERSION_KEY] = 3;
    const entered = deferred();
    const release = deferred();
    storage.sync.set.mockImplementationOnce(async (items) => {
      entered.resolve();
      await release.promise;
      Object.assign(storage.state.sync, items);
    });
    const reset = resetIncompatibleAISettings();
    await entered.promise;
    const patch = patchSettings({
      voiceInput: { correction: { enabled: true, model: selection } },
    });
    const proof = expect(patch).rejects.toThrow('AI model selection changed');
    release.resolve();
    await reset;
    await proof;
    expect((await loadSettings()).voiceInput?.correction).toEqual({ enabled: false, model: null });
  });

  it('resets a voice selection committed before reset admission', async () => {
    const entered = deferred();
    const release = deferred();
    storage.sync.set.mockImplementationOnce(async (items) => {
      entered.resolve();
      await release.promise;
      Object.assign(storage.state.sync, items);
    });
    const patch = patchSettings({
      voiceInput: { correction: { enabled: true, model: selection } },
    });
    await entered.promise;
    storage.state.local[AI_STORAGE_VERSION_KEY] = 3;
    const reset = resetIncompatibleAISettings();
    release.resolve();
    await patch;
    await reset;
    expect((await loadSettings()).voiceInput?.correction).toEqual({ enabled: false, model: null });
  });
});

it('merges parallel canonical recognition and correction approvals without a second voice selection map', async () => {
  const recognitionModel: AIModel = {
    ...model,
    id: 'recognition',
    modelCode: 'exact-asr',
    operation: 'transcription',
    audio: { transcription: { responseFormat: 'json', timestampGranularity: 'none' } },
  };
  storage.state.local[AI_MODELS_KEY] = [model, recognitionModel];
  const recognition = {
    ...selection,
    modelId: recognitionModel.id,
    approvedModelCode: recognitionModel.modelCode,
  };
  const entered = deferred();
  const release = deferred();
  storage.sync.set.mockImplementationOnce(async (items) => {
    entered.resolve();
    await release.promise;
    Object.assign(storage.state.sync, items);
  });
  const first = patchSettings({ voiceInput: { transcription: recognition } });
  await entered.promise;
  const second = patchSettings({ voiceInput: { correction: { enabled: true, model: selection } } });
  release.resolve();
  await Promise.all([first, second]);
  expect((await loadSettings()).voiceInput).toMatchObject({
    transcription: recognition,
    correction: { enabled: true, model: selection },
  });
  expect(storage.state.local[AI_SCENARIO_SELECTIONS_KEY]).toBeUndefined();
});

it('retains the canonical voice approval after storage refusal and accepts an explicit retry', async () => {
  const before = (await loadSettings()).voiceInput;
  storage.sync.set.mockRejectedValueOnce(new Error('Storage refused'));
  const patch = { voiceInput: { correction: { enabled: true, model: selection } } };
  await expect(patchSettings(patch)).rejects.toThrow('Storage refused');
  expect((await loadSettings()).voiceInput).toEqual(before);
  await patchSettings(patch);
  expect((await loadSettings()).voiceInput?.correction?.model).toEqual(selection);
  expect(storage.state.local[AI_SCENARIO_SELECTIONS_KEY]).toBeUndefined();
});

it.each(['delete', 'restore'] as const)(
  'rejects delayed canonical voice approval after %s',
  async (action) => {
    const before = (await loadSettings()).voiceInput;
    const entered = deferred();
    const release = deferred();
    const transition = runWithExclusivePersistenceMutationPermit(async () => {
      entered.resolve();
      await release.promise;
      storage.state.local[AI_PROVIDERS_KEY] =
        action === 'delete' ? [] : [{ ...provider, incarnation: 'restored' }];
    });
    await entered.promise;
    const write = patchSettings({
      voiceInput: { correction: { enabled: true, model: selection } },
    });
    const refusal = expect(write).rejects.toThrow('AI model selection changed');
    release.resolve();
    await transition;
    await refusal;
    expect((await loadSettings()).voiceInput).toEqual(before);
    expect(storage.sync.set).not.toHaveBeenCalled();
  }
);
