// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => {
  const ReactModule = await import('react');
  const actual = await importOriginal<typeof import('@sniptale/ui/product-form-controls')>();
  return {
    ...actual,
    ProductTextarea: ReactModule.forwardRef<
      HTMLTextAreaElement,
      React.TextareaHTMLAttributes<HTMLTextAreaElement>
    >(function ProductTextarea(props, ref) {
      return <textarea ref={ref} {...props} />;
    }),
  };
});

import { translate } from '../../../../platform/i18n';
import { AIProvidersPromptCard } from './prompt-card';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderUi(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

it('renders prompt save failures inline and disables the save button while a prompt is saving', async () => {
  await renderUi(
    <AIProvidersPromptCard
      prompt={{
        isSaving: true,
        saveError: 'Prompt save failed',
        value: 'Global prompt',
        textareaRef: { current: null },
        setValue: vi.fn(),
        handleSave: vi.fn().mockResolvedValue(undefined),
        handleResizeStart: vi.fn(),
      }}
      descriptionKey="settings.aiProviders.globalPromptDescription"
      saveButtonKey="settings.aiProviders.globalPromptSaveButton"
    />
  );

  expect(container?.textContent).toContain('Prompt save failed');
  const saveButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(translate('settings.aiProviders.globalPromptSaveButton'))
  );
  expect(saveButton?.disabled).toBe(true);
});
