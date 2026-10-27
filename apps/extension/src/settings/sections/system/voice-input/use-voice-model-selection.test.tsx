// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AIModelCatalogPayload } from '../../../../contracts/messaging/ai-settings-runtime';
import type { VoiceInputPreferences } from '@sniptale/runtime-contracts/voice-input';
import { useVoiceModelSelection, voiceProviderSelection } from './use-voice-model-selection';

const provider = {
  id: 'provider',
  name: 'Provider',
  connectionType: 'openai-compatible',
  createdAt: 1,
  hasStoredApiKey: true,
  destinationKind: 'external',
  destinationBinding: `sha256:${'a'.repeat(64)}`,
} as const;
function catalog(operation: 'text' | 'transcription'): AIModelCatalogPayload {
  return {
    providers: [provider],
    models: [
      {
        id: 'model',
        providerId: 'provider',
        modelCode: 'speech',
        displayName: 'Configured',
        operation,
      },
    ],
  };
}
let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useVoiceModelSelection> | null;
let prefs: VoiceInputPreferences;
const updatePreference = vi.fn().mockResolvedValue(undefined);
const deps = {
  catalog: vi.fn(async (operation) =>
    catalog(operation === 'voice-recognition' ? 'transcription' : 'text')
  ),
  prompt: vi.fn(async () => 'Local instructions'),
  savePrompt: vi.fn().mockResolvedValue(undefined),
  resetPrompt: vi.fn().mockResolvedValue(undefined),
};
function Harness() {
  state = useVoiceModelSelection({ preferences: prefs, updatePreference, deps });
  return null;
}
async function render() {
  await act(async () => {
    root.render(<Harness />);
    await Promise.resolve();
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  prefs = { language: 'ru-RU', microphoneDeviceId: null, mode: 'local-first' };
  updatePreference.mockResolvedValue(undefined);
  deps.catalog.mockImplementation(async (operation) =>
    catalog(operation === 'voice-recognition' ? 'transcription' : 'text')
  );
  deps.resetPrompt.mockResolvedValue(undefined);
  deps.prompt.mockResolvedValue('Local instructions');
  deps.savePrompt.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  state = null;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
it('loads operation-specific catalogues without approving the first model', async () => {
  await render();
  expect(deps.catalog).toHaveBeenCalledWith('voice-recognition');
  expect(deps.catalog).toHaveBeenCalledWith('voice-correction');
  expect(updatePreference).not.toHaveBeenCalled();
  expect(state?.transcriptionSelectionId).toBeNull();
  await act(async () => state?.selectTranscription('model'));
  expect(updatePreference).toHaveBeenCalledWith({
    transcription: {
      modelId: 'model',
      approvedProviderId: 'provider',
      approvedDestination: provider.destinationBinding,
      approvedModelCode: 'speech',
    },
  });
});
it('rejects built-in, missing-binding and absent models instead of creating approvals', () => {
  const base = catalog('transcription');
  expect(voiceProviderSelection(base, 'missing')).toBeNull();
  expect(
    voiceProviderSelection(
      { ...base, providers: [{ ...provider, destinationBinding: undefined }] },
      'model'
    )
  ).toBeNull();
  expect(
    voiceProviderSelection(
      { ...base, providers: [{ ...provider, connectionType: 'chrome-built-in' }] },
      'model'
    )
  ).toBeNull();
});
it('saves correction instructions only through the local prompt owner and preserves drafts after failure', async () => {
  await render();
  act(() => state?.setPrompt('My instructions'));
  deps.savePrompt.mockRejectedValueOnce(new Error('storage failure'));
  await act(async () => state?.savePrompt());
  expect(state?.prompt).toBe('My instructions');
  expect(state?.promptDirty).toBe(true);
  expect(state?.error).toBe(true);
  await act(async () => state?.savePrompt());
  expect(deps.savePrompt).toHaveBeenLastCalledWith('My instructions');
  expect(state?.promptDirty).toBe(false);
  expect(updatePreference).not.toHaveBeenCalled();
  deps.prompt.mockResolvedValueOnce('Default instructions');
  await act(async () => state?.resetPrompt());
  expect(state?.prompt).toBe('Default instructions');
});
it('does not apply an asynchronous catalogue after unmount', async () => {
  let resolve!: (value: AIModelCatalogPayload) => void;
  deps.catalog.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  await render();
  act(() => root.render(null));
  await act(async () => resolve(catalog('transcription')));
  expect(updatePreference).not.toHaveBeenCalled();
});

it('recognizes approved pins and requires a new selection when a provider destination changes', async () => {
  const selection = voiceProviderSelection(catalog('transcription'), 'model');
  if (!selection) throw new Error('Configured speech model is missing');
  prefs = { ...prefs, transcription: selection, correction: { enabled: true, model: selection } };
  await render();
  expect(state?.transcriptionSelectionId).toBe('model');
  expect(state?.correctionSelectionId).toBe('model');
  const destination = `sha256:${'b'.repeat(64)}`;
  deps.catalog.mockImplementation(async (operation) => ({
    ...catalog(operation === 'voice-recognition' ? 'transcription' : 'text'),
    providers: [{ ...provider, destinationBinding: destination }],
  }));
  await act(async () => state?.refresh());
  expect(state?.transcriptionSelectionId).toBeNull();
  expect(state?.correctionSelectionId).toBeNull();
  expect(updatePreference).not.toHaveBeenCalled();
  await act(async () => state?.selectCorrection('model'));
  expect(updatePreference).toHaveBeenCalledWith({
    correction: { enabled: true, model: { ...selection, approvedDestination: destination } },
  });
});
it('keeps edited instructions and usable models through refresh failure and recovery', async () => {
  await render();
  act(() => state?.setPrompt('Keep this unsaved draft'));
  deps.catalog.mockRejectedValueOnce(new Error('worker unavailable'));
  await act(async () => state?.refresh());
  expect(state?.error).toBe(true);
  expect(state?.loading).toBe(false);
  expect(state?.transcription.models).toHaveLength(1);
  deps.prompt.mockResolvedValueOnce('Changed stored instructions');
  await act(async () => state?.refresh());
  expect(state?.error).toBe(false);
  expect(state?.prompt).toBe('Keep this unsaved draft');
  expect(state?.promptDirty).toBe(true);
});
it('does not start a second prompt mutation while Save owns the pending operation', async () => {
  await render();
  act(() => state?.setPrompt('Instructions to save'));
  let finish!: () => void;
  deps.savePrompt.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    })
  );
  let saving: Promise<void> | undefined;
  act(() => {
    saving = state?.savePrompt();
  });
  expect(state?.promptSaving).toBe(true);
  await act(async () => state?.resetPrompt());
  expect(deps.resetPrompt).not.toHaveBeenCalled();
  await act(async () => {
    finish();
    await saving;
  });
  expect(state?.promptSaving).toBe(false);
  expect(state?.promptDirty).toBe(false);
});
it('ignores a failed older reload after a newer catalogue has recovered', async () => {
  await render();
  let fail!: (error: Error) => void;
  deps.catalog.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      })
  );
  let oldReload: Promise<void> | undefined;
  act(() => {
    oldReload = state?.refresh();
  });
  deps.prompt.mockResolvedValueOnce('Latest instructions');
  await act(async () => state?.refresh());
  expect(state?.prompt).toBe('Latest instructions');
  await act(async () => {
    fail(new Error('stale worker failure'));
    await oldReload;
  });
  expect(state?.error).toBe(false);
  expect(state?.loading).toBe(false);
  expect(state?.prompt).toBe('Latest instructions');
});

it('lists admitted named providers without approving canonical voice preferences', async () => {
  deps.catalog.mockImplementation(async (operation) => ({
    ...catalog(operation === 'voice-recognition' ? 'transcription' : 'text'),
    providers: [{ ...provider, connectionType: 'neuraldeep' }],
  }));
  await render();
  expect(state?.transcription.models.map((model) => model.id)).toEqual(['model']);
  expect(state?.correction.models.map((model) => model.id)).toEqual(['model']);
  expect(state?.transcriptionSelectionId).toBeNull();
  expect(updatePreference).not.toHaveBeenCalled();
});

it('keeps canonical voice choices separate and waits for their accepted preference snapshot', async () => {
  const selected = voiceProviderSelection(catalog('transcription'), 'model');
  if (!selected) throw new Error('Missing selection');
  prefs = { ...prefs, transcription: selected, correction: { enabled: true, model: null } };
  await render();
  expect(state?.transcriptionSelectionId).toBe('model');
  expect(state?.correctionSelectionId).toBeNull();
  let finish!: () => void;
  updatePreference.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    })
  );
  let pending: Promise<void> | undefined;
  act(() => {
    pending = state?.selectCorrection('model');
  });
  expect(state?.correctionSelectionId).toBeNull();
  expect(state?.transcriptionSelectionId).toBe('model');
  await act(async () => {
    finish();
    await pending;
  });
  expect(state?.correctionSelectionId).toBeNull();
  prefs = { ...prefs, correction: { enabled: true, model: selected } };
  await render();
  expect(state?.correctionSelectionId).toBe('model');
  expect(updatePreference).toHaveBeenCalledExactlyOnceWith({
    correction: { enabled: true, model: selected },
  });
});

it('retains the accepted selection after a refused voice write and permits explicit retry', async () => {
  await render();
  updatePreference.mockRejectedValueOnce(new Error('write refused'));
  await act(async () => {
    await expect(state?.selectTranscription('model')).rejects.toThrow('write refused');
  });
  expect(state?.transcriptionSelectionId).toBeNull();
  await act(async () => state?.selectTranscription('model'));
  expect(updatePreference).toHaveBeenCalledTimes(2);
  expect(state?.transcriptionSelectionId).toBeNull();
});

it('keeps a missing approved model unresolved across refresh without selecting another model', async () => {
  const approved = voiceProviderSelection(catalog('transcription'), 'model');
  if (!approved) throw new Error('Missing selection');
  prefs = { ...prefs, transcription: approved, correction: { enabled: true, model: approved } };
  await render();
  deps.catalog.mockImplementation(async (scenario) => ({
    ...catalog(scenario === 'voice-recognition' ? 'transcription' : 'text'),
    models: [{ ...catalog('text').models[0]!, id: 'replacement' }],
  }));
  await act(async () => state?.refresh());
  expect(state?.transcriptionSelectionId).toBeNull();
  expect(state?.correctionSelectionId).toBeNull();
  expect(state?.transcriptionUnavailable).toBe(true);
  expect(state?.correctionUnavailable).toBe(true);
  expect(updatePreference).not.toHaveBeenCalled();
});

it('admits local configured correction without borrowing a global model choice', async () => {
  deps.catalog.mockImplementation(async (scenario) => ({
    ...catalog(scenario === 'voice-recognition' ? 'transcription' : 'text'),
    providers: [{ ...provider, connectionType: 'lm-studio', hasStoredApiKey: false }],
  }));
  await render();
  expect(state?.correction.models).toHaveLength(1);
  expect(state?.correctionSelectionId).toBeNull();
  await act(async () => state?.selectCorrection('model'));
  expect(updatePreference).toHaveBeenCalledWith({
    correction: { enabled: false, model: voiceProviderSelection(catalog('text'), 'model') },
  });
});

it('reports a failed initial catalog read without declaring an approved model unavailable', async () => {
  const approved = voiceProviderSelection(catalog('transcription'), 'model');
  if (!approved) throw new Error('Missing selection');
  prefs = { ...prefs, transcription: approved };
  deps.catalog.mockRejectedValue(new Error('network failed'));
  await render();
  expect(state?.error).toBe(true);
  expect(state?.transcriptionUnavailable).toBe(false);
  expect(updatePreference).not.toHaveBeenCalled();
});

it.each([
  ['save', 'success'],
  ['save', 'failure'],
  ['reset', 'success'],
  ['reset', 'failure'],
] as const)(
  'serializes catalog refresh with %s prompt %s and releases recovery controls',
  async (command, outcome) => {
    await render();
    act(() => state?.setPrompt('Keep this instruction draft'));
    let resolve!: () => void;
    let reject!: (cause: Error) => void;
    const hold = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    if (command === 'save') deps.savePrompt.mockReturnValueOnce(hold);
    else deps.resetPrompt.mockReturnValueOnce(hold);
    let mutation: Promise<void> | undefined;
    act(() => {
      mutation = command === 'save' ? state?.savePrompt() : state?.resetPrompt();
    });
    expect(state?.promptSaving).toBe(true);
    await act(async () => state?.refresh());
    await act(async () => {
      if (outcome === 'success') resolve();
      else reject(new Error('Storage refused'));
      await mutation;
    });
    expect(state?.promptSaving).toBe(false);
    expect(deps.catalog).toHaveBeenCalledTimes(2);
    if (outcome === 'failure') {
      expect(state?.prompt).toBe('Keep this instruction draft');
      expect(state?.promptDirty).toBe(true);
      expect(state?.error).toBe(true);
      await act(async () => state?.savePrompt());
      expect(state?.promptSaving).toBe(false);
      expect(state?.promptDirty).toBe(false);
    }
    await act(async () => state?.refresh());
    expect(deps.catalog).toHaveBeenCalledTimes(4);
    expect(state?.loading).toBe(false);
    expect(state?.promptSaving).toBe(false);
  }
);
