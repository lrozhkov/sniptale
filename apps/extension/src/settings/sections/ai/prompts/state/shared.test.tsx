// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useAiProvidersPromptState } from './shared';
import {
  cleanupPromptHarness,
  enablePromptStateActEnvironment,
  renderPromptHarness,
  type RenderedPromptHarness,
} from './test-support';

let rendered: RenderedPromptHarness | null = null;
let latestPrompt: ReturnType<typeof useAiProvidersPromptState> | null = null;

function Harness(props: {
  persist: (value: string) => Promise<string | null>;
  reset?: () => Promise<{ error: string | null }>;
  setSourceValue?: (value: string) => void;
  setPersistedValue?: (value: string) => void;
  persistedValue?: string;
}) {
  latestPrompt = useAiProvidersPromptState({
    defaultValue: 'Factory prompt',
    handleResizeStart: vi.fn(),
    persist: props.persist,
    reset: props.reset ?? (async () => ({ error: null })),
    setSourceValue: props.setSourceValue ?? vi.fn(),
    setPersistedValue: props.setPersistedValue ?? vi.fn(),
    textareaRef: { current: null },
    value: 'Prompt value',
    persistedValue: props.persistedValue ?? 'Prompt value',
  });
  return null;
}

async function render(node: React.ReactNode) {
  rendered = await renderPromptHarness(node, rendered);
}

beforeEach(() => {
  enablePromptStateActEnvironment();
});

it('exposes dirty and factory-reset state independently', async () => {
  await render(<Harness persist={vi.fn()} persistedValue="Customized saved prompt" />);
  expect(latestPrompt?.status.isDirty).toBe(true);
  expect(latestPrompt?.status.canReset).toBe(true);

  await render(<Harness persist={vi.fn()} persistedValue="Factory prompt" />);
  expect(latestPrompt?.status.isDirty).toBe(true);
  expect(latestPrompt?.status.canReset).toBe(false);
});

it('applies a factory reset only after the reset owner succeeds', async () => {
  const setSourceValue = vi.fn();
  const setPersistedValue = vi.fn();
  const reset = vi.fn().mockResolvedValue({ error: null });
  await render(
    <Harness
      persist={vi.fn()}
      reset={reset}
      setSourceValue={setSourceValue}
      setPersistedValue={setPersistedValue}
    />
  );

  await act(async () => {
    await latestPrompt?.handleReset();
  });

  expect(reset).toHaveBeenCalledOnce();
  expect(setSourceValue).toHaveBeenCalledWith('Factory prompt');
  expect(setPersistedValue).toHaveBeenCalledWith('Factory prompt');
  expect(latestPrompt?.status.saveError).toBeNull();
});

it('keeps the edited value when the reset owner reports a failure', async () => {
  const setSourceValue = vi.fn();
  await render(
    <Harness
      persist={vi.fn()}
      reset={vi.fn().mockResolvedValue({ error: 'Reset failed' })}
      setSourceValue={setSourceValue}
    />
  );

  await act(async () => {
    await latestPrompt?.handleReset();
  });

  expect(setSourceValue).not.toHaveBeenCalled();
  expect(latestPrompt?.status.saveError).toBe('Reset failed');
});

afterEach(async () => {
  await cleanupPromptHarness(rendered);
  rendered = null;
  latestPrompt = null;
  vi.unstubAllGlobals();
});

it('clears the saving flag after an unexpected prompt persistence rejection', async () => {
  const persist = vi.fn().mockRejectedValue(new Error('unexpected failure'));

  await render(<Harness persist={persist} />);

  await expect(
    act(async () => {
      await latestPrompt?.handleSave();
    })
  ).rejects.toThrow('unexpected failure');
  expect(latestPrompt?.status.isSaving).toBe(false);
});
