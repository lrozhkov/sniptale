// @vitest-environment jsdom

import { act, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { openAIModalSettingsMock } = vi.hoisted(() => ({
  openAIModalSettingsMock: vi.fn(),
}));

vi.mock('./settings-navigation', () => ({
  openAIModalSettings: openAIModalSettingsMock,
}));
vi.mock('../../../../../features/ai/model-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/ai/model-selector')>()),
  AIModelSelector: (props: { selectedModelId: string | null }) => (
    <button type="button" data-ui="ai-model-selector.trigger">
      {props.selectedModelId ?? 'unset'}
    </button>
  ),
}));
vi.mock('@sniptale/ui/product-modal/actions', () => ({
  ProductActionButton: ({
    children,
    ...props
  }: PropsWithChildren<React.ComponentProps<'button'>>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));
vi.mock('@sniptale/ui/product-modal', () => ({
  ProductModalFooter: ({ children }: PropsWithChildren) => <footer>{children}</footer>,
}));

import { AIModalFooter } from './footer';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  openAIModalSettingsMock.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderFooter(
  models = [
    {
      displayName: 'Model',
      id: 'model-1',
      modelCode: 'model',
      providerId: 'provider-1',
      systemPrompt: '',
    },
  ]
) {
  await act(async () => {
    root.render(
      <AIModalFooter
        availableModels={models}
        disabledSubmit={models.length === 0}
        isLoading={false}
        onClose={vi.fn()}
        onSelectModel={vi.fn()}
        onSubmit={vi.fn()}
        providers={[]}
        selectedData=""
        selectedModelId={models.length ? 'model-1' : null}
        totalTokens={12}
      />
    );
  });
}

it('renders the submit action after Cancel and opens model settings from a subtle action', async () => {
  await renderFooter();

  const footerButtons = Array.from(
    container.querySelectorAll('.sniptale-ai-modal-footer-actions > button')
  );
  expect(footerButtons.map((button) => button.textContent)).toEqual(['Отмена', 'Отправить запрос']);
  const settings = container.querySelector<HTMLButtonElement>(
    '[aria-label="Открыть настройки подключений и моделей"]'
  );
  act(() => settings?.click());

  expect(openAIModalSettingsMock).toHaveBeenCalledWith(
    { section: 'ai-connections' },
    expect.any(Event)
  );
});

it('disables the footer submit action when submission preconditions are not met', async () => {
  await renderFooter([]);
  expect(
    Array.from(
      container.querySelectorAll<HTMLButtonElement>('.sniptale-ai-modal-footer-actions > button')
    ).find((button) => button.textContent === 'Отправить запрос')?.disabled
  ).toBe(true);
});

it('shows an explicit blocking reason when no model is configured', async () => {
  await renderFooter([]);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Сначала настройте хотя бы одну AI-модель'
  );
});

it('keeps the data disclosure in the submit hint instead of a visible footer row', async () => {
  await renderFooter();
  const submit = Array.from(
    container.querySelectorAll<HTMLButtonElement>('.sniptale-ai-modal-footer-actions > button')
  ).find((button) => button.textContent === 'Отправить запрос');

  expect(container.querySelector('[data-ui="ai-modal.disclosure"]')).toBeNull();
  expect(submit?.title).toContain('настроенный AI-провайдер');
  expect(submit?.title).toContain('промпт без данных страницы');
  expect(submit?.title).toContain('только метаданные запроса');
});
