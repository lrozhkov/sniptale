// @vitest-environment jsdom

import type React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const promptMocks = vi.hoisted(() => ({
  saveGlobalPromptMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  translateMock: vi.fn((value: string) => value),
}));

vi.mock('../../../runtime/settings-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/settings-mutations')>()),
  saveGlobalSystemPrompt: promptMocks.saveGlobalPromptMock,
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

import { useAiProvidersGlobalPromptState } from './global';
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
let latestPrompt: ReturnType<typeof useAiProvidersGlobalPromptState> | null = null;

function Harness(props: { dataState: Parameters<typeof useAiProvidersGlobalPromptState>[0] }) {
  latestPrompt = useAiProvidersGlobalPromptState(props.dataState);
  return null;
}

async function render(node: React.ReactNode) {
  rendered = await renderPromptHarness(node, rendered);
}

beforeEach(() => {
  enablePromptStateActEnvironment();
  promptMocks.saveGlobalPromptMock.mockReset();
  promptMocks.toastSuccessMock.mockReset();
  promptMocks.translateMock.mockImplementation((value: string) => value);
});

afterEach(async () => {
  await cleanupPromptHarness(rendered);
  rendered = null;
  latestPrompt = null;
  vi.unstubAllGlobals();
});

it('wires the global prompt state locally', async () => {
  const globalPromptRef = createTextareaRef();
  const setGlobalPromptState = vi.fn();

  await render(
    <Harness dataState={createPromptSource({ globalPromptRef, setGlobalPromptState })} />
  );

  expect(latestPrompt?.value).toBe('Global prompt');

  latestPrompt?.setValue('Updated global');
  await latestPrompt?.handleSave();
  latestPrompt?.handleResizeStart({
    clientY: 100,
    preventDefault: vi.fn(),
  } as never);
  dispatchPromptResize(140);

  expect(setGlobalPromptState).toHaveBeenCalledWith('Updated global');
  expect(promptMocks.saveGlobalPromptMock).toHaveBeenCalledWith('Global prompt');
  expect(promptMocks.toastSuccessMock).toHaveBeenCalledWith(
    'settings.aiProviders.globalPromptSavedMessage'
  );
  expect(globalPromptRef.current?.style.height).toBe('160px');
});
