// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AIModelSelectionBootstrapPayload } from '../../../../contracts/messaging/ai-settings-runtime';
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
function catalog(operation: 'text' | 'transcription'): AIModelSelectionBootstrapPayload {
  return {
    chromeAiEnabled: false,
    defaultModelId: 'model',
    globalSystemPrompt: '',
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
  bootstrap: vi.fn(async (operation) =>
    catalog(operation === 'transcription' ? 'transcription' : 'text')
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
  deps.bootstrap.mockImplementation(async (operation) =>
    catalog(operation === 'transcription' ? 'transcription' : 'text')
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
  expect(deps.bootstrap).toHaveBeenCalledWith('transcription');
  expect(deps.bootstrap).toHaveBeenCalledWith('text');
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
  let resolve!: (value: AIModelSelectionBootstrapPayload) => void;
  deps.bootstrap.mockImplementationOnce(
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
  deps.bootstrap.mockImplementation(async (operation) => ({
    ...catalog(operation === 'transcription' ? 'transcription' : 'text'),
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
  deps.bootstrap.mockRejectedValueOnce(new Error('worker unavailable'));
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
  deps.bootstrap.mockImplementationOnce(
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
