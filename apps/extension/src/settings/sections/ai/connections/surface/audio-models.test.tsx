// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';
import { AIProvidersModelsCard } from './models-card';
import { AIProvidersSectionModals, ModelFormModal } from './modals';
import { createMockAiProvidersSectionState } from './test-support';

const { updateModel, addModel } = vi.hoisted(() => ({ updateModel: vi.fn(), addModel: vi.fn() }));
vi.mock('../../../../runtime/ai-settings/mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../runtime/ai-settings/mutations')>()),
  updateAIModel: updateModel,
  addAIModel: addModel,
}));

const provider: AIProvider = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Audio connection',
  connectionType: 'openai-compatible',
  baseUrl: 'https://example.test/v1',
  hasStoredApiKey: true,
  createdAt: 1,
};
const legacy: AIModel = {
  id: '00000000-0000-4000-8000-000000000002',
  providerId: provider.id,
  modelCode: 'legacy-model',
  displayName: 'Legacy text',
  systemPrompt: 'Keep the text prompt.',
};
const speech: AIModel = {
  id: '00000000-0000-4000-8000-000000000003',
  providerId: provider.id,
  modelCode: 'speech-model',
  displayName: 'Narration',
  operation: 'speech',
  audio: {
    speech: { voiceId: 'narrator', responseFormat: 'wav', speed: 1.2, instructions: 'Calm' },
  },
};
let container: HTMLDivElement;
let root: Root;
type Key = Parameters<typeof translate>[0];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  updateModel.mockReset().mockResolvedValue(undefined);
  addModel.mockReset().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function render(node: ReactNode) {
  await act(async () => root.render(node));
}
function required<T extends Element>(node: T | null | undefined): T {
  if (!node) throw new Error('Expected rendered control.');
  return node;
}
function control(key: Key) {
  return required(
    Array.from(container.querySelectorAll<HTMLElement>('[aria-label]')).find(
      (node) => node.getAttribute('aria-label') === translate(key)
    )
  );
}
async function choose(key: Key, label: string) {
  await act(async () => control(key).click());
  const option = required(
    Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(
      (node) => node.textContent === label
    )
  );
  await act(async () => option.click());
}
async function fill(key: Key, value: string) {
  const input = control(key);
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement))
    throw new Error('Expected editable field.');
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value'
    )!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function save() {
  await act(async () =>
    required(container.querySelector('form')).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    )
  );
}

it('edits transcription parameters through real controls and sends a coherent timestamp format', async () => {
  await render(
    <ModelFormModal model={legacy} providers={[provider]} onClose={vi.fn()} onSave={vi.fn()} />
  );
  await choose(
    'settings.aiProviders.modelOperationLabel',
    translate('settings.aiProviders.modelOperationTranscription')
  );
  expect(container.textContent).not.toContain(translate('settings.aiProviders.modelPromptLabel'));
  await fill('settings.aiProviders.modelAudioLanguage', 'ru');
  await fill('settings.aiProviders.modelAudioPrompt', 'Project vocabulary');
  await choose(
    'settings.aiProviders.modelAudioTimestamps',
    translate('settings.aiProviders.modelAudioTimestampsSegment')
  );
  await save();
  expect(updateModel).toHaveBeenLastCalledWith({
    id: legacy.id,
    providerId: provider.id,
    modelCode: legacy.modelCode,
    displayName: legacy.displayName,
    operation: 'transcription',
    audio: {
      transcription: {
        language: 'ru',
        prompt: 'Project vocabulary',
        responseFormat: 'verbose_json',
        timestampGranularity: 'segment',
      },
    },
  });
  await choose('settings.aiProviders.modelAudioFormat', 'JSON');
  await act(async () => control('settings.aiProviders.modelAudioTimestamps').click());
  expect(
    Array.from(document.querySelectorAll('[role="option"]')).map((node) => node.textContent)
  ).toEqual([translate('settings.aiProviders.modelAudioTimestampsNone')]);
  await act(async () =>
    required(document.querySelector<HTMLButtonElement>('[role="option"]')).click()
  );
  await fill('settings.aiProviders.modelAudioLanguage', '');
  await save();
  expect(updateModel).toHaveBeenLastCalledWith(
    expect.objectContaining({
      audio: {
        transcription: {
          prompt: 'Project vocabulary',
          responseFormat: 'json',
          timestampGranularity: 'none',
        },
      },
    })
  );
  await choose(
    'settings.aiProviders.modelAudioFormat',
    translate('settings.aiProviders.modelAudioVerboseJson')
  );
  await choose(
    'settings.aiProviders.modelAudioTimestamps',
    translate('settings.aiProviders.modelAudioTimestampsWord')
  );
  await save();
  expect(updateModel).toHaveBeenLastCalledWith(
    expect.objectContaining({
      audio: {
        transcription: {
          prompt: 'Project vocabulary',
          responseFormat: 'verbose_json',
          timestampGranularity: 'word',
        },
      },
    })
  );
});

it('switches speech purpose, edits optional parameters and restores the legacy text prompt', async () => {
  await render(
    <ModelFormModal model={legacy} providers={[provider]} onClose={vi.fn()} onSave={vi.fn()} />
  );
  await choose(
    'settings.aiProviders.modelOperationLabel',
    translate('settings.aiProviders.modelOperationSpeech')
  );
  await fill('settings.aiProviders.modelAudioVoice', 'custom-voice');
  await choose('settings.aiProviders.modelAudioFormat', 'WAV');
  await fill('settings.aiProviders.modelAudioSpeed', '1.5');
  await fill('settings.aiProviders.modelAudioInstructions', 'Speak clearly');
  await save();
  expect(updateModel).toHaveBeenLastCalledWith(
    expect.objectContaining({
      operation: 'speech',
      audio: {
        speech: {
          voiceId: 'custom-voice',
          responseFormat: 'wav',
          speed: 1.5,
          instructions: 'Speak clearly',
        },
      },
    })
  );
  expect(updateModel.mock.lastCall?.[0]).not.toHaveProperty('systemPrompt');
  await fill('settings.aiProviders.modelAudioSpeed', '');
  await fill('settings.aiProviders.modelAudioInstructions', '');
  await choose('settings.aiProviders.modelAudioFormat', 'MP3');
  await save();
  expect(updateModel).toHaveBeenLastCalledWith(
    expect.objectContaining({
      audio: { speech: { voiceId: 'custom-voice', responseFormat: 'mp3' } },
    })
  );
  await choose(
    'settings.aiProviders.modelOperationLabel',
    translate('settings.aiProviders.modelOperationText')
  );
  expect(container.querySelector('textarea')?.value).toBe(legacy.systemPrompt);
  expect(container.textContent).not.toContain(translate('settings.aiProviders.modelAudioVoice'));
  await save();
  expect(updateModel).toHaveBeenLastCalledWith({ ...legacy, operation: 'text' });
});

it('loads an existing speech model and refuses an invalid voice before saving a correction', async () => {
  const onSave = vi.fn();
  await render(
    <ModelFormModal model={speech} providers={[provider]} onClose={vi.fn()} onSave={onSave} />
  );
  expect(control('settings.aiProviders.modelAudioVoice')).toHaveProperty('value', 'narrator');
  expect(control('settings.aiProviders.modelAudioSpeed')).toHaveProperty('value', '1.2');
  expect(control('settings.aiProviders.modelAudioInstructions')).toHaveProperty('value', 'Calm');
  await fill('settings.aiProviders.modelAudioVoice', '');
  await save();
  expect(updateModel).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  expect(container.querySelector('.sniptale-error-text')).not.toBeNull();
  await fill('settings.aiProviders.modelAudioVoice', 'new-narrator');
  await save();
  expect(updateModel).toHaveBeenCalledWith({
    ...speech,
    audio: { speech: { ...speech.audio!.speech!, voiceId: 'new-narrator' } },
  });
  expect(onSave).toHaveBeenCalledOnce();
});

it('reloads the catalog before closing an edited audio model and keeps the dialog on failed refresh', async () => {
  const state = createMockAiProvidersSectionState();
  state.providers = [provider];
  state.modals.model = { open: true, model: speech };
  vi.mocked(state.reloadData).mockRejectedValueOnce(new Error('fixture refresh failed'));
  await render(<AIProvidersSectionModals state={state} />);
  await save();
  expect(state.modals.closeModelModal).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await save();
  expect(state.reloadData).toHaveBeenCalledTimes(2);
  expect(state.modals.closeModelModal).toHaveBeenCalledOnce();
  expect(vi.mocked(state.reloadData).mock.invocationCallOrder[1]).toBeLessThan(
    vi.mocked(state.modals.closeModelModal).mock.invocationCallOrder[0]!
  );
});

it('shows audio purposes while restricting the default action to text models', async () => {
  const state = createMockAiProvidersSectionState();
  const transcription: AIModel = {
    ...speech,
    id: '00000000-0000-4000-8000-000000000004',
    displayName: 'Recognition',
    operation: 'transcription',
    audio: { transcription: { responseFormat: 'json', timestampGranularity: 'none' } },
  };
  state.providers = [provider];
  state.models = [legacy, speech, transcription];
  state.getProviderName = () => provider.name;
  await render(<AIProvidersModelsCard state={state} />);
  const row = (id: string) =>
    required(container.querySelector<HTMLElement>(`[data-settings-collection-item="${id}"]`));
  expect(row(speech.id).textContent).toContain(
    `${provider.name} · ${speech.modelCode} · ${translate('settings.aiProviders.modelOperationSpeech')}`
  );
  expect(row(transcription.id).textContent).toContain(
    translate('settings.aiProviders.modelOperationTranscription')
  );
  expect(row(legacy.id).textContent).toContain(
    translate('settings.aiProviders.modelPromptOverriddenPrefix')
  );
  expect(row(speech.id).querySelector('[data-collection-inline-action="set-default"]')).toBeNull();
  expect(
    row(transcription.id).querySelector('[data-collection-inline-action="set-default"]')
  ).toBeNull();
  await act(async () =>
    required(row(legacy.id).querySelector<HTMLButtonElement>('[aria-expanded]')).click()
  );
  await act(async () =>
    required(
      row(legacy.id).querySelector<HTMLButtonElement>(
        '[data-collection-inline-action="set-default"]'
      )
    ).click()
  );
  expect(state.catalogActions.setDefaultModel).toHaveBeenCalledWith(legacy.id);
  await act(async () =>
    required(
      row(speech.id).querySelector<HTMLButtonElement>(
        `[aria-label="${translate('settings.collection.actions.edit')}"]`
      )
    ).click()
  );
  expect(state.modals.openModelModal).toHaveBeenCalledWith(speech);
  await act(async () =>
    required(row(speech.id).querySelector<HTMLButtonElement>('[aria-expanded]')).click()
  );
  await act(async () =>
    required(
      row(speech.id).querySelector<HTMLButtonElement>('[data-collection-inline-action="delete"]')
    ).click()
  );
  expect(state.modals.setConfirmDelete).toHaveBeenCalledWith({ type: 'model', item: speech });
  state.defaultModelId = legacy.id;
  await render(<AIProvidersModelsCard state={state} />);
  expect(row(legacy.id).querySelector('[data-collection-inline-action="set-default"]')).toBeNull();
});

it('cancels or confirms audio model deletion without deleting its provider', async () => {
  const state = createMockAiProvidersSectionState();
  state.modals.confirmDelete = { type: 'model', item: speech };
  await render(<AIProvidersSectionModals state={state} />);
  expect(container.textContent).toContain(speech.displayName);
  expect(container.textContent).toContain(translate('settings.aiProviders.deleteModelTitle'));
  const action = (key: Key) =>
    required(
      Array.from(container.querySelectorAll('button')).find(
        (node) => node.textContent === translate(key)
      )
    );
  await act(async () => action('common.actions.cancel').click());
  expect(state.modals.setConfirmDelete).toHaveBeenCalledWith(null);
  expect(state.catalogActions.deleteModel).not.toHaveBeenCalled();
  state.modals.confirmDelete = null;
  await render(<AIProvidersSectionModals state={state} />);
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  state.modals.confirmDelete = { type: 'model', item: speech };
  await render(<AIProvidersSectionModals state={state} />);
  await act(async () => action('common.actions.delete').click());
  expect(state.catalogActions.deleteModel).toHaveBeenCalledOnce();
  expect(state.catalogActions.deleteProvider).not.toHaveBeenCalled();
});
