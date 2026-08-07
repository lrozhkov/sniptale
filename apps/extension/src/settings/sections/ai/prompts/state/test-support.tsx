import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';

import type { AiProvidersPromptSource } from './types';

export type RenderedPromptHarness = {
  container: HTMLDivElement;
  root: Root;
};

export function createPromptSource(
  overrides: Partial<AiProvidersPromptSource> = {}
): AiProvidersPromptSource {
  return {
    globalPrompt: 'Global prompt',
    globalPromptRef: { current: null },
    scenarioEditorPrompt: 'Scenario prompt',
    scenarioEditorPromptRef: { current: null },
    setGlobalPromptState: () => undefined,
    setScenarioEditorPromptState: () => undefined,
    ...overrides,
  };
}

export function createTextareaRef(
  height = 120
): React.MutableRefObject<HTMLTextAreaElement | null> {
  const textarea = document.createElement('textarea');
  Object.defineProperty(textarea, 'clientHeight', {
    configurable: true,
    value: height,
  });

  return { current: textarea };
}

export function enablePromptStateActEnvironment(): void {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
}

export async function renderPromptHarness(
  node: React.ReactNode,
  rendered: RenderedPromptHarness | null
): Promise<RenderedPromptHarness> {
  if (rendered) {
    await act(async () => {
      rendered.root.render(node);
    });
    return rendered;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(node);
  });

  return { container, root };
}

export async function cleanupPromptHarness(rendered: RenderedPromptHarness | null): Promise<void> {
  await act(async () => {
    rendered?.root.unmount();
  });
  rendered?.container.remove();
}

export function dispatchPromptResize(toClientY: number): void {
  document.dispatchEvent(new MouseEvent('mousemove', { clientY: toClientY }));
  document.dispatchEvent(new MouseEvent('mouseup'));
}
