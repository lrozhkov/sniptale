// @vitest-environment jsdom

import { act, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

type MockActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  compact?: boolean;
  tone?: string;
};

vi.mock('../../../../../features/ai/model-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/ai/model-selector')>()),
  AIModelSelector: (props: { selectedModelId: string | null }) => (
    <button type="button" data-ui="ai-model-selector.trigger">
      {props.selectedModelId ?? 'unset'}
    </button>
  ),
}));

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: ({
    active: _active,
    children,
    compact: _compact,
    disabled,
    onClick,
    tone: _tone,
    ...props
  }: PropsWithChildren<MockActionButtonProps>) => (
    <button type="button" disabled={disabled} onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModalFooter: ({ children }: PropsWithChildren) => <footer>{children}</footer>,
}));

import {
  CHROME_AI_MODEL_ID,
  mergeChromeAiProviderSelectorEntries,
} from '../../../../../features/ai/chrome/constants';
import type { AIProviderSelectorEntry } from '../../../../../contracts/messaging/ai-settings-runtime';
import type { AIModel } from '../../../../../contracts/settings';
import { AIModalFooter } from './footer';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProvider(overrides: Partial<AIProviderSelectorEntry> = {}): AIProviderSelectorEntry {
  return {
    connectionType: 'openai-compatible',
    createdAt: 1,
    destinationKind: 'external',
    hasStoredApiKey: true,
    id: 'provider-1',
    name: 'Provider',
    ...overrides,
  };
}

function createModel(overrides: Partial<AIModel> = {}): AIModel {
  return {
    displayName: 'Model',
    id: 'model-1',
    modelCode: 'model-code',
    providerId: 'provider-1',
    systemPrompt: '',
    ...overrides,
  };
}

async function renderFooter(args: {
  disabledSubmit?: boolean;
  isLoading?: boolean;
  models?: AIModel[];
  providers?: AIProviderSelectorEntry[];
  selectedData?: string;
  selectedModelId?: string | null;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <AIModalFooter
        availableModels={args.models ?? [createModel()]}
        disabledSubmit={args.disabledSubmit ?? false}
        isLoading={args.isLoading ?? false}
        onClose={vi.fn()}
        onSelectModel={vi.fn()}
        onSubmit={vi.fn()}
        providers={args.providers ?? [createProvider()]}
        selectedData={
          args.selectedData ??
          JSON.stringify({ f: [{ id: 'field-1' }], t: [{ r: [{ id: 'row-1' }] }] })
        }
        selectedModelId={args.selectedModelId ?? 'model-1'}
        totalTokens={12}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function getSubmitButton() {
  return Array.from(container?.querySelectorAll('button') ?? []).at(-1) ?? null;
}

function getSubmitTip() {
  return container?.querySelector<HTMLElement>('[data-ui="ai-modal.submit-tip"]') ?? null;
}

it('moves the before-sending copy into the submit tip without provider, model, or data rows', async () => {
  await renderFooter({});

  const submitButton = getSubmitButton();
  const submitTip = getSubmitTip();

  expect(container?.querySelector('[data-ui="ai-modal.disclosure"]')).toBeNull();
  expect(submitTip?.id).toBeTruthy();
  expect(submitButton?.getAttribute('aria-describedby')).toBe(submitTip?.id);
  expect(submitTip?.textContent).toContain('Перед отправкой');
  expect(submitTip?.textContent).toContain('выбранные данные страницы');
  expect(submitTip?.textContent).toContain('ваш промпт');
  expect(submitTip?.textContent).toContain('данные покидают браузер');
  expect(submitTip?.textContent).not.toContain('Провайдер');
  expect(submitTip?.textContent).not.toContain('Provider ·');
  expect(submitTip?.textContent).not.toContain('Модель');
  expect(submitTip?.textContent).not.toContain('Model');
  expect(submitTip?.textContent).not.toContain('editable fields and table rows');
});

it('shows local custom provider egress in the submit tip', async () => {
  await renderFooter({
    providers: [createProvider({ destinationKind: 'local-custom', name: 'Ollama' })],
  });

  const submitTip = getSubmitTip();

  expect(submitTip?.textContent).not.toContain('Ollama');
  expect(submitTip?.textContent).toContain('не отправляются на внешний provider URL');
});

it('shows Chrome AI egress in the submit tip', async () => {
  const chromeEntries = mergeChromeAiProviderSelectorEntries({ models: [], providers: [] });

  await renderFooter({
    models: chromeEntries.models,
    providers: chromeEntries.providers,
    selectedModelId: CHROME_AI_MODEL_ID,
  });

  const submitTip = getSubmitTip();

  expect(submitTip?.textContent).not.toContain('Google');
  expect(submitTip?.textContent).toContain('не отправляются на внешний provider URL');
});

it('keeps the submit tip attached when submit is disabled', async () => {
  await renderFooter({ disabledSubmit: true });

  const submitButton = getSubmitButton();
  const submitTip = getSubmitTip();

  expect(submitButton?.disabled).toBe(true);
  expect(submitButton?.getAttribute('aria-describedby')).toBe(submitTip?.id);
});
