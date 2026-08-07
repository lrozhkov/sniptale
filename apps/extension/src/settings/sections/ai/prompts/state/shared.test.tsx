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

function Harness(props: { persist: (value: string) => Promise<string | null> }) {
  latestPrompt = useAiProvidersPromptState({
    handleResizeStart: vi.fn(),
    persist: props.persist,
    setSourceValue: vi.fn(),
    textareaRef: { current: null },
    value: 'Prompt value',
  });
  return null;
}

async function render(node: React.ReactNode) {
  rendered = await renderPromptHarness(node, rendered);
}

beforeEach(() => {
  enablePromptStateActEnvironment();
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
  expect(latestPrompt?.isSaving).toBe(false);
});
