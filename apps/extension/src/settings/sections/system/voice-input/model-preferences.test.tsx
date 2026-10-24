// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VoiceModelPreferences } from './model-preferences';
import type { VoiceInputSettingsController } from './controller-contract';
vi.mock('../../../../platform/i18n', () => ({ translate: (key: string) => key }));
vi.mock('../../../../features/ai/model-selector', () => ({
  AIModelSelector: (props: { onSelect(id: string): void; disabled: boolean }) => (
    <button disabled={props.disabled} onClick={() => props.onSelect('chosen')}>
      Choose configured model
    </button>
  ),
}));
const empty = {
  chromeAiEnabled: false,
  defaultModelId: null,
  globalSystemPrompt: '',
  models: [],
  providers: [],
};
function createController(): Pick<VoiceInputSettingsController, 'models' | 'preferences'> {
  return {
    preferences: {
      backend: 'browser',
      transcription: null,
      correction: { enabled: false, model: null },
      language: 'ru-RU',
      microphoneDeviceId: null,
      mode: 'local-first',
      saving: false,
      setBackend: vi.fn().mockResolvedValue(undefined),
      setCorrectionEnabled: vi.fn().mockResolvedValue(undefined),
      setLanguage: vi.fn().mockResolvedValue(undefined),
      setMode: vi.fn().mockResolvedValue(undefined),
      setMicrophoneDeviceId: vi.fn().mockResolvedValue(undefined),
    },
    models: {
      transcription: empty,
      correction: empty,
      transcriptionSelectionId: null,
      correctionSelectionId: null,
      loading: false,
      error: false,
      prompt: 'Keep my words',
      promptDirty: true,
      promptSaving: false,
      refresh: vi.fn().mockResolvedValue(undefined),
      setPrompt: vi.fn(),
      savePrompt: vi.fn().mockResolvedValue(undefined),
      resetPrompt: vi.fn().mockResolvedValue(undefined),
      selectTranscription: vi.fn().mockResolvedValue(undefined),
      selectCorrection: vi.fn().mockResolvedValue(undefined),
    },
  };
}
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
it('uses the incumbent segmented backend control and correction switch', () => {
  const controller = createController();
  act(() => root.render(<VoiceModelPreferences controller={controller} disabled={false} />));
  expect(
    container.querySelector(
      '[data-ui="settings.voice.backend"] [data-ui="shared.ui.compact-inspector.segmented-row"]'
    )
  ).not.toBeNull();
  expect(container.querySelector('[data-ui="settings.voice.transcription-model"]')).toBeNull();
  const model = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'settings.voiceInput.backendModel'
  );
  act(() => model?.click());
  expect(controller.preferences.setBackend).toHaveBeenCalledWith('model');
  controller.preferences.backend = 'model';
  act(() => root.render(<VoiceModelPreferences controller={controller} disabled={false} />));
  act(() => container.querySelector<HTMLButtonElement>('[role=switch]')?.click());
  expect(controller.preferences.setCorrectionEnabled).toHaveBeenCalledWith(true);
});
it('shows configured model selectors and local correction prompt controls', () => {
  const controller = createController();
  controller.preferences.backend = 'model';
  controller.preferences.correction.enabled = true;
  act(() => root.render(<VoiceModelPreferences controller={controller} disabled={false} />));
  expect(container.querySelector('[data-ui="settings.voice.transcription-model"]')).not.toBeNull();
  expect(container.querySelector('[data-ui="settings.voice.correction-model"]')).not.toBeNull();
  expect(container.querySelector('textarea')?.value).toBe('Keep my words');
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-ui="settings.voice.prompt-save"]')?.click()
  );
  expect(controller.models.savePrompt).toHaveBeenCalledOnce();
  expect(container.querySelector('a')?.getAttribute('href')).toBe(
    '?section=access-data&view=permissions'
  );
});

it('routes model selection, prompt editing and reset through their existing controllers', () => {
  const controller = createController();
  controller.preferences.backend = 'model';
  controller.preferences.correction.enabled = true;
  act(() => root.render(<VoiceModelPreferences controller={controller} disabled={false} />));
  for (const kind of ['transcription', 'correction']) {
    act(() =>
      container
        .querySelector<HTMLButtonElement>(`[data-ui="settings.voice.${kind}-model"] button`)
        ?.click()
    );
  }
  expect(controller.models.selectTranscription).toHaveBeenCalledWith('chosen');
  expect(controller.models.selectCorrection).toHaveBeenCalledWith('chosen');
  const field = container.querySelector('textarea');
  if (!field) throw new Error('Correction instructions field is missing');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      field,
      'Preserve technical names'
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(controller.models.setPrompt).toHaveBeenCalledWith('Preserve technical names');
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-ui="settings.voice.prompt-reset"]')?.click()
  );
  expect(controller.models.resetPrompt).toHaveBeenCalledOnce();
});
it('offers catalogue reload after failure and disables editing during an owned operation', () => {
  const controller = createController();
  controller.preferences.backend = 'model';
  controller.preferences.correction.enabled = true;
  controller.models.error = true;
  act(() => root.render(<VoiceModelPreferences controller={controller} disabled={false} />));
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'settings.voiceInput.modelsError'
  );
  const reload = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent === 'settings.voiceInput.reloadModels'
  );
  act(() => reload?.click());
  expect(controller.models.refresh).toHaveBeenCalledOnce();
  act(() => root.render(<VoiceModelPreferences controller={controller} disabled />));
  expect(container.querySelector('textarea')?.disabled).toBe(true);
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-ui="settings.voice.prompt-reset"]')?.click()
  );
  expect(controller.models.resetPrompt).not.toHaveBeenCalled();
  expect(
    container.querySelector<HTMLButtonElement>('[data-ui="settings.voice.correction-model"] button')
      ?.disabled
  ).toBe(true);
});

it('shows transcription configuration only for the selected model backend', () => {
  const controller = createController();
  act(() => root.render(<VoiceModelPreferences controller={controller} disabled={false} />));
  expect(container.querySelector('[data-ui="settings.voice.transcription-model"]')).toBeNull();
  controller.preferences.backend = 'model';
  act(() => root.render(<VoiceModelPreferences controller={controller} disabled={false} />));
  expect(container.querySelector('[data-ui="settings.voice.transcription-model"]')).not.toBeNull();
});

it('hides saved model correction and catalogue failures in Chrome and restores the model draft', () => {
  const controller = createController();
  controller.preferences.correction.enabled = true;
  controller.models.error = true;
  const render = () =>
    act(() => root.render(<VoiceModelPreferences controller={controller} disabled={false} />));
  render();
  expect(container.querySelector('[role="switch"]')).toBeNull();
  expect(container.querySelector('[data-ui="settings.voice.correction-model"]')).toBeNull();
  expect(container.querySelector('textarea')).toBeNull();
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector('a')).toBeNull();
  controller.preferences.backend = 'model';
  render();
  expect(container.querySelector('textarea')?.value).toBe('Keep my words');
  controller.preferences.backend = 'browser';
  render();
  controller.preferences.backend = 'model';
  render();
  expect(container.querySelector('textarea')?.value).toBe('Keep my words');
  expect(controller.preferences.setCorrectionEnabled).not.toHaveBeenCalled();
  expect(controller.models.setPrompt).not.toHaveBeenCalled();
});
