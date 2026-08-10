// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('./prompt-card', () => ({
  AIProvidersPromptCard: ({ descriptionKey }: { descriptionKey: string }) => (
    <div>{descriptionKey}</div>
  ),
}));
import { AiPromptsContent } from './content';
it('renders both prompt mutation surfaces', () => {
  const prompt = {
    status: { canReset: false, isDirty: false, isSaving: false, saveError: null },
    value: '',
    textareaRef: { current: null },
    setValue: vi.fn(),
    handleReset: vi.fn(),
    handleSave: vi.fn(),
    handleResizeStart: vi.fn(),
  };
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<AiPromptsContent prompts={{ global: prompt, scenarioEditor: prompt }} />));
  expect(node.textContent).toContain('globalPromptDescription');
  expect(node.textContent).toContain('scenarioEditorPromptDescription');
  act(() => root.unmount());
});
