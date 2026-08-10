// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const controller = vi.hoisted(() => ({ state: { isLoading: false, error: false, prompts: {} } }));
vi.mock('./controller', () => ({ useAiPromptsController: () => controller.state }));
vi.mock('./surface/content', () => ({ AiPromptsContent: () => <div>prompt-settings</div> }));
vi.mock('./templates', () => ({ TemplatesSection: () => <div>prompt-templates</div> }));
import { AIPromptsSection } from '.';
it('opens templates first and switches to prompts through the route callback', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  const onViewChange = vi.fn();
  act(() => root.render(<AIPromptsSection onViewChange={onViewChange} />));
  expect(node.textContent).toContain('prompt-templates');
  expect(node.textContent).not.toContain('prompt-settings');
  const promptsTab = Array.from(node.querySelectorAll('button')).find((button) =>
    button.textContent?.includes('Промпты')
  );
  act(() => promptsTab?.click());
  expect(onViewChange).toHaveBeenCalledWith('prompts');

  act(() => root.render(<AIPromptsSection view="prompts" onViewChange={onViewChange} />));
  expect(node.textContent).toContain('prompt-settings');
  expect(node.textContent).not.toContain('prompt-templates');
  act(() => root.unmount());
});

it('keeps prompt loading and error states inside the prompts subpage', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  controller.state = { isLoading: true, error: false, prompts: {} };
  act(() => root.render(<AIPromptsSection view="prompts" />));
  expect(node.textContent).not.toContain('prompt-templates');
  controller.state = { isLoading: false, error: true, prompts: {} };
  act(() => root.render(<AIPromptsSection view="prompts" />));
  expect(node.querySelector('[role="alert"]')).not.toBeNull();
  expect(node.textContent).not.toContain('prompt-templates');
  act(() => root.unmount());
});
