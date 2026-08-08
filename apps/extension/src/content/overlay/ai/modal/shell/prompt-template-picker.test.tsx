// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { openAIModalSettingsMock, productSelectMock } = vi.hoisted(() => ({
  openAIModalSettingsMock: vi.fn(),
  productSelectMock: vi.fn(),
}));

vi.mock('./settings-navigation', () => ({
  openAIModalSettings: openAIModalSettingsMock,
}));
vi.mock('@sniptale/ui/product-form-controls', () => ({
  ProductSelect: (props: { disabled: boolean; onChange(value: string): void }) => {
    productSelectMock(props);
    return (
      <button
        data-ui="ai-modal.template-picker"
        disabled={props.disabled}
        onClick={() => props.onChange('template-1')}
        type="button"
      >
        template
      </button>
    );
  },
}));

import { AIModalPromptTemplatePicker } from './prompt-template-picker';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  openAIModalSettingsMock.mockClear();
  productSelectMock.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('copies the selected template through the canonical selection action', () => {
  const onSelectTemplate = vi.fn(async () => undefined);
  act(() => {
    root.render(
      <AIModalPromptTemplatePicker
        disabled={false}
        isLoading={false}
        onSelectTemplate={onSelectTemplate}
        templates={[{ content: 'Rewrite', enabled: true, id: 'template-1', name: 'Rewrite' }]}
      />
    );
  });
  act(() =>
    container.querySelector<HTMLButtonElement>('[data-ui="ai-modal.template-picker"]')?.click()
  );

  expect(onSelectTemplate).toHaveBeenCalledWith(expect.objectContaining({ id: 'template-1' }));
  expect(productSelectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      menuClassName: 'sniptale-ai-modal-template-menu',
      menuScrollable: true,
      options: [{ description: 'Rewrite', label: 'Rewrite', value: 'template-1' }],
    })
  );
});

it('opens Prompt and Templates settings from the adjacent action', () => {
  act(() => {
    root.render(
      <AIModalPromptTemplatePicker
        disabled={false}
        isLoading={false}
        onSelectTemplate={vi.fn(async () => undefined)}
        templates={[]}
      />
    );
  });
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Открыть настройки промптов и шаблонов"]')
      ?.click()
  );

  expect(openAIModalSettingsMock).toHaveBeenCalledWith(
    { section: 'ai-prompts' },
    expect.any(Event)
  );
});
