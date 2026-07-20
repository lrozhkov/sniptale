// @vitest-environment jsdom

import type React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const promptMocks = vi.hoisted(() => ({
  saveGlobalPromptMock: vi.fn(),
  saveScenarioPromptMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  translateMock: vi.fn((value: string) => value),
}));

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: promptMocks.translateMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    success: promptMocks.toastSuccessMock,
  },
}));

vi.mock('../../save', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../save')>()),
  saveAiProvidersGlobalPrompt: promptMocks.saveGlobalPromptMock,
  saveAiProvidersScenarioEditorPrompt: promptMocks.saveScenarioPromptMock,
}));

import { useAiProvidersPromptState } from './build';
import {
  cleanupPromptHarness,
  createPromptSource,
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
  promptMocks.toastSuccessMock.mockReset();
  promptMocks.translateMock.mockImplementation((value: string) => value);
});

afterEach(async () => {
  await cleanupPromptHarness(rendered);
  rendered = null;
  latestPrompts = null;
  vi.unstubAllGlobals();
});

it('wires prompt values, save handlers, and resize hooks locally', async () => {
  const globalPromptRef: React.MutableRefObject<HTMLTextAreaElement | null> = { current: null };
  const scenarioEditorPromptRef: React.MutableRefObject<HTMLTextAreaElement | null> = {
    current: null,
  };
  const setGlobalPromptState = vi.fn();
  const setScenarioEditorPromptState = vi.fn();

  await render(
    <Harness
      dataState={createPromptSource({
        globalPromptRef,
        scenarioEditorPromptRef,
        setGlobalPromptState,
        setScenarioEditorPromptState,
      })}
    />
  );

  expect(latestPrompts?.global.value).toBe('Global prompt');
  expect(latestPrompts?.scenarioEditor.value).toBe('Scenario prompt');

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
