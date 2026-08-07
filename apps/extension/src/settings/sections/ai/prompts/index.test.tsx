// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const controller = vi.hoisted(() => ({ state: { isLoading: false, error: false, prompts: {} } }));
vi.mock('./controller', () => ({ useAiPromptsController: () => controller.state }));
vi.mock('./surface/content', () => ({ AiPromptsContent: () => <div>prompt-settings</div> }));
vi.mock('./templates', () => ({ TemplatesSection: () => <div>prompt-templates</div> }));
import { AIPromptsSection } from '.';
it('provides one entry point for prompts and templates', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<AIPromptsSection />));
  expect(node.textContent).toContain('prompt-settings');
  expect(node.textContent).toContain('prompt-templates');
  act(() => root.unmount());
});

it('renders loading and error states while preserving the templates entry point', () => {
  const node = document.createElement('div');
  const root = createRoot(node);
  controller.state = { isLoading: true, error: false, prompts: {} };
  act(() => root.render(<AIPromptsSection />));
  expect(node.textContent).not.toContain('prompt-templates');
  controller.state = { isLoading: false, error: true, prompts: {} };
  act(() => root.render(<AIPromptsSection />));
  expect(node.querySelector('[role="alert"]')).not.toBeNull();
  expect(node.textContent).toContain('prompt-templates');
  act(() => root.unmount());
});
