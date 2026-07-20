// @vitest-environment jsdom

import type React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const promptMocks = vi.hoisted(() => ({
  saveScenarioPromptMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  translateMock: vi.fn((value: string) => value),
}));

vi.mock('../../../runtime/settings-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/settings-mutations')>()),
  saveScenarioEditorSystemPrompt: promptMocks.saveScenarioPromptMock,
}));

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: promptMocks.translateMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    error: vi.fn(),
    success: promptMocks.toastSuccessMock,
  },
}));

import { useAiProvidersScenarioEditorPromptState } from './scenario-editor';
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
let latestPrompt: ReturnType<typeof useAiProvidersScenarioEditorPromptState> | null = null;

function Harness(props: {
  dataState: Parameters<typeof useAiProvidersScenarioEditorPromptState>[0];
}) {
  latestPrompt = useAiProvidersScenarioEditorPromptState(props.dataState);
  return null;
}

async function render(node: React.ReactNode) {
  rendered = await renderPromptHarness(node, rendered);
}

beforeEach(() => {
  enablePromptStateActEnvironment();
  promptMocks.saveScenarioPromptMock.mockReset();
  promptMocks.toastSuccessMock.mockReset();
  promptMocks.translateMock.mockImplementation((value: string) => value);
});

afterEach(async () => {
  await cleanupPromptHarness(rendered);
  rendered = null;
  latestPrompt = null;
  vi.unstubAllGlobals();
});

it('wires the scenario editor prompt state locally', async () => {
  const scenarioEditorPromptRef = createTextareaRef();
  const setScenarioEditorPromptState = vi.fn();

  await render(
    <Harness
      dataState={createPromptSource({ scenarioEditorPromptRef, setScenarioEditorPromptState })}
    />
  );

  expect(latestPrompt?.value).toBe('Scenario prompt');

  latestPrompt?.setValue('Updated scenario');
  await latestPrompt?.handleSave();
  latestPrompt?.handleResizeStart({
    clientY: 100,
    preventDefault: vi.fn(),
  } as never);
  dispatchPromptResize(140);

  expect(setScenarioEditorPromptState).toHaveBeenCalledWith('Updated scenario');
  expect(promptMocks.saveScenarioPromptMock).toHaveBeenCalledWith('Scenario prompt');
  expect(promptMocks.toastSuccessMock).toHaveBeenCalledWith(
    'settings.aiProviders.scenarioEditorPromptSavedMessage'
  );
  expect(scenarioEditorPromptRef.current?.style.height).toBe('160px');
});
