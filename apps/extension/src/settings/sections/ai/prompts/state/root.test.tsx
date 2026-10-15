// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const promptMocks = vi.hoisted(() => ({
  saveGlobalPromptMock: vi.fn(),
  saveScenarioPromptMock: vi.fn(),
  saveAudioPromptMock: vi.fn(),
  resetAudioPromptMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  translateMock: vi.fn((value: string) => value),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: promptMocks.translateMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    success: promptMocks.toastSuccessMock,
  },
}));

vi.mock('../save', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../save')>()),
  saveAiProvidersGlobalPrompt: promptMocks.saveGlobalPromptMock,
  saveAiProvidersScenarioEditorPrompt: promptMocks.saveScenarioPromptMock,
  saveAiProvidersAudioTranscriptionPrompt: promptMocks.saveAudioPromptMock,
  resetAiProvidersAudioTranscriptionPrompt: promptMocks.resetAudioPromptMock,
}));

import { useAiProvidersPromptState } from './build';
import {
  cleanupPromptHarness,
  createPromptSource,
  createTextareaRef,
  dispatchPromptResize,
  enablePromptStateActEnvironment,
  renderPromptHarness,
  type RenderedPromptHarness,
} from './test-support';

let rendered: RenderedPromptHarness | null = null;
let latestPrompts: ReturnType<typeof useAiProvidersPromptState> | null = null;

function Harness(props: { dataState: Parameters<typeof useAiProvidersPromptState>[0] }) {
  latestPrompts = useAiProvidersPromptState(props.dataState);
  return null;
}

async function render(node: React.ReactNode) {
  rendered = await renderPromptHarness(node, rendered);
}

beforeEach(() => {
  enablePromptStateActEnvironment();
  promptMocks.saveGlobalPromptMock.mockReset();
  promptMocks.saveScenarioPromptMock.mockReset();
  promptMocks.saveAudioPromptMock.mockReset().mockResolvedValue(null);
  promptMocks.resetAudioPromptMock.mockReset().mockResolvedValue({ error: null });
  promptMocks.toastSuccessMock.mockReset();
  promptMocks.translateMock.mockImplementation((value: string) => value);
});

it('saves and resets recognition instructions without replacing persisted values after failure', async () => {
  const setSource = vi.fn();
  const setPersisted = vi.fn();
  await render(
    <Harness
      dataState={createPromptSource({
        audioTranscriptionPrompt: 'Updated instructions',
        persistedAudioTranscriptionPrompt: 'Previous instructions',
        setAudioTranscriptionPromptState: setSource,
        setPersistedAudioTranscriptionPrompt: setPersisted,
      })}
    />
  );
  expect(latestPrompts?.audioTranscription.status.isDirty).toBe(true);
  expect(latestPrompts?.audioTranscription.handleResizeStart).toEqual(expect.any(Function));
  await act(async () => latestPrompts?.audioTranscription.handleSave());
  expect(promptMocks.saveAudioPromptMock).toHaveBeenCalledWith('Updated instructions');
  expect(setPersisted).toHaveBeenCalledWith('Updated instructions');
  setPersisted.mockClear();
  promptMocks.saveAudioPromptMock.mockResolvedValueOnce('Save failed');
  await act(async () => latestPrompts?.audioTranscription.handleSave());
  expect(latestPrompts?.audioTranscription.status.saveError).toBe('Save failed');
  expect(setPersisted).not.toHaveBeenCalled();
  await act(async () => latestPrompts?.audioTranscription.setValue('Retry instructions'));
  expect(latestPrompts?.audioTranscription.status.saveError).toBeNull();
  expect(setSource).toHaveBeenCalledWith('Retry instructions');
  await render(
    <Harness
      dataState={createPromptSource({
        audioTranscriptionPrompt: 'Retry instructions',
        persistedAudioTranscriptionPrompt: 'Updated instructions',
        setAudioTranscriptionPromptState: setSource,
        setPersistedAudioTranscriptionPrompt: setPersisted,
      })}
    />
  );
  expect(latestPrompts?.audioTranscription.value).toBe('Retry instructions');
  const { DEFAULT_AUDIO_TRANSCRIPTION_SYSTEM_PROMPT } =
    await import('../../../../../composition/persistence/ai-settings/constants');
  await act(async () => latestPrompts?.audioTranscription.handleReset());
  expect(setSource).toHaveBeenCalledWith(DEFAULT_AUDIO_TRANSCRIPTION_SYSTEM_PROMPT);
  expect(setPersisted).toHaveBeenCalledWith(DEFAULT_AUDIO_TRANSCRIPTION_SYSTEM_PROMPT);
  setPersisted.mockClear();
  promptMocks.resetAudioPromptMock.mockResolvedValueOnce({ error: 'Reset failed' });
  await act(async () => latestPrompts?.audioTranscription.handleReset());
  expect(latestPrompts?.audioTranscription.status.saveError).toBe('Reset failed');
  expect(setPersisted).not.toHaveBeenCalled();
});

afterEach(async () => {
  await cleanupPromptHarness(rendered);
  rendered = null;
  latestPrompts = null;
  vi.unstubAllGlobals();
});

it('wires prompt values, save handlers, and resize hooks locally', async () => {
  const audioTranscriptionPromptRef = createTextareaRef();
  const globalPromptRef: React.MutableRefObject<HTMLTextAreaElement | null> = { current: null };
  const scenarioEditorPromptRef: React.MutableRefObject<HTMLTextAreaElement | null> = {
    current: null,
  };
  const setGlobalPromptState = vi.fn();
  const setScenarioEditorPromptState = vi.fn();

  await render(
    <Harness
      dataState={createPromptSource({
        audioTranscriptionPromptRef,
        globalPromptRef,
        scenarioEditorPromptRef,
        setGlobalPromptState,
        setScenarioEditorPromptState,
      })}
    />
  );

  expect(latestPrompts?.global.value).toBe('Global prompt');
  expect(latestPrompts?.scenarioEditor.value).toBe('Scenario prompt');
  expect(latestPrompts?.audioTranscription.value).toBe('Recognition instructions');
  act(() => {
    latestPrompts?.audioTranscription.handleResizeStart({
      clientY: 100,
      preventDefault: vi.fn(),
    } as never);
    dispatchPromptResize(140);
  });
  expect(audioTranscriptionPromptRef.current?.style.height).toBe('160px');
  await act(async () => {
    latestPrompts?.audioTranscription.setValue('Updated recognition');
    await latestPrompts?.audioTranscription.handleSave();
    await latestPrompts?.audioTranscription.handleReset();
  });

  latestPrompts?.global.setValue('Updated global');
  latestPrompts?.scenarioEditor.setValue('Updated scenario');
  await latestPrompts?.global.handleSave();
  await latestPrompts?.scenarioEditor.handleSave();

  expect(setGlobalPromptState).toHaveBeenCalledWith('Updated global');
  expect(setScenarioEditorPromptState).toHaveBeenCalledWith('Updated scenario');
  expect(promptMocks.saveGlobalPromptMock).toHaveBeenCalledWith('Global prompt');
  expect(promptMocks.saveScenarioPromptMock).toHaveBeenCalledWith('Scenario prompt');
  expect(latestPrompts?.global.handleResizeStart).toEqual(expect.any(Function));
  expect(latestPrompts?.scenarioEditor.handleResizeStart).toEqual(expect.any(Function));
});
