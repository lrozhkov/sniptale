// @vitest-environment jsdom

import type React from 'react';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../platform/i18n';
import { type AIModel, type AIProvider } from '../../../contracts/settings';

vi.mock('@sniptale/ui/product-menus/dropdown', () => ({
  ProductDropdownMenu: (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div data-testid="dropdown-menu" {...props} />
  ),
  ProductDropdownItem: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }
  ) => <button data-selected={props.selected ? 'true' : 'false'} type="button" {...props} />,
  ProductDropdownSectionLabel: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
}));

vi.mock('@sniptale/ui/product-form-controls', async () => {
  const ReactModule = await import('react');
  return {
    ProductInput: ReactModule.forwardRef<
      HTMLInputElement,
      React.InputHTMLAttributes<HTMLInputElement>
    >(function ProductInput(props, ref) {
      return <input ref={ref} {...props} />;
    }),
  };
});

import { AIModelSelector } from './index';

const PROVIDERS: AIProvider[] = [
  {
    id: 'provider-1',
    name: 'OpenAI',
    connectionType: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    hasStoredApiKey: true,
    createdAt: 1,
  },
  {
    id: 'provider-2',
    name: 'Ollama',
    connectionType: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    hasStoredApiKey: true,
    createdAt: 2,
  },
];

const MODELS: AIModel[] = [
  {
    id: 'model-1',
    providerId: 'provider-1',
    modelCode: 'gpt-4.1',
    displayName: 'GPT 4.1',
    systemPrompt: '',
  },
  {
    id: 'model-2',
    providerId: 'provider-2',
    modelCode: 'llama3.2',
    displayName: 'Llama 3.2',
    systemPrompt: '',
  },
];

const CHROME_AI_PROVIDER: AIProvider = {
  id: 'chrome-ai-google-provider',
  name: 'Google',
  connectionType: 'chrome-built-in',
  baseUrl: 'chrome://built-in-ai',
  hasStoredApiKey: false,
  createdAt: 0,
};

const CHROME_AI_MODEL: AIModel = {
  id: 'chrome-ai-google-model',
  providerId: 'chrome-ai-google-provider',
  modelCode: 'chrome-prompt-api',
  displayName: 'Google Chrome AI',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function renderUi(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

function getButtons() {
  return Array.from(container?.querySelectorAll('button') ?? []);
}

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  vi.restoreAllMocks();
  container?.remove();
  container = null;
  root = null;
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 100, 280, 32)
  );
});

it('renders an empty state when no models are available', async () => {
  await renderUi(
    <AIModelSelector models={[]} onSelect={vi.fn()} providers={[]} selectedModelId={null} />
  );

  expect(container?.textContent).toContain(translate('aiModal.modelNotSelected'));
  expect(container?.querySelector('.sniptale-ai-model-selector-missing')).toBeTruthy();
  expect(container?.querySelector('[data-testid="dropdown-menu"]')).toBeNull();
});

it('opens, focuses, filters, selects a model, and clears the search query on close', async () => {
  const onSelect = vi.fn();

  await renderUi(
    <AIModelSelector
      models={MODELS}
      onSelect={onSelect}
      providers={PROVIDERS}
      selectedModelId="model-1"
    />
  );

  const trigger = getButtons()[0];
  expect(trigger?.textContent).toContain('OpenAI / GPT 4.1');

  await act(async () => {
    trigger?.click();
  });

  const searchInput = container?.querySelector('input');
  expect(searchInput).toBeInstanceOf(HTMLInputElement);
  expect(document.activeElement).toBe(searchInput);

  await act(async () => {
    searchInput?.dispatchEvent(new Event('click', { bubbles: true }));
    if (searchInput instanceof HTMLInputElement) {
      setInputValue(searchInput, 'llama');
    }
  });

  const dropdownText = container?.querySelector('[data-testid="dropdown-menu"]')?.textContent ?? '';
  expect(dropdownText).toContain('Llama 3.2');
  expect(dropdownText).not.toContain('GPT 4.1');

  const modelButton = getButtons().find((button) => button.textContent?.includes('Llama 3.2'));
  await act(async () => {
    modelButton?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  expect(onSelect).toHaveBeenCalledWith('model-2');
  expect(container?.querySelector('[data-testid="dropdown-menu"]')).toBeNull();

  await act(async () => {
    trigger?.click();
  });
  expect((container?.querySelector('input') as HTMLInputElement | null)?.value).toBe('');
});

it('keeps the dropdown open when a custom within-element resolver claims the event', async () => {
  const isEventWithinElement = vi.fn((_event: MouseEvent, _element: Element | null) => true);

  await renderUi(
    <AIModelSelector
      isEventWithinElement={isEventWithinElement}
      models={MODELS}
      onSelect={vi.fn()}
      providers={PROVIDERS}
      selectedModelId={null}
    />
  );

  const trigger = getButtons()[0];
  await act(async () => {
    trigger?.click();
  });
  expect(container?.querySelector('[data-testid="dropdown-menu"]')).not.toBeNull();

  await act(async () => {
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  expect(container?.querySelector('[data-testid="dropdown-menu"]')).not.toBeNull();
  expect(isEventWithinElement).toHaveBeenCalled();
});

it('closes on outside mouse down when using the default event containment check', async () => {
  await renderUi(
    <AIModelSelector
      models={MODELS}
      onSelect={vi.fn()}
      providers={PROVIDERS}
      selectedModelId={null}
    />
  );

  const trigger = getButtons()[0];
  await act(async () => {
    trigger?.click();
  });

  expect(container?.querySelector('[data-testid="dropdown-menu"]')).not.toBeNull();

  await act(async () => {
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  expect(container?.querySelector('[data-testid="dropdown-menu"]')).toBeNull();
});

it('keeps the dropdown closed when disabled', async () => {
  await renderUi(
    <AIModelSelector
      disabled
      models={MODELS}
      onSelect={vi.fn()}
      providers={PROVIDERS}
      selectedModelId={null}
    />
  );

  const trigger = getButtons()[0];
  await act(async () => {
    trigger?.click();
  });

  expect(container?.querySelector('[data-testid="dropdown-menu"]')).toBeNull();
});

it('falls back to the unset trigger label when the selected model cannot be resolved', async () => {
  await renderUi(
    <AIModelSelector
      models={MODELS}
      onSelect={vi.fn()}
      providers={PROVIDERS}
      selectedModelId="missing-model"
    />
  );

  expect(getButtons()[0]?.textContent).toContain(translate('aiModal.modelUnsetOption'));
});

it('renders the virtual chrome-ai selector label when the synthetic provider and model are present', async () => {
  await renderUi(
    <AIModelSelector
      models={[...MODELS, CHROME_AI_MODEL]}
      onSelect={vi.fn()}
      providers={[...PROVIDERS, CHROME_AI_PROVIDER]}
      selectedModelId="chrome-ai-google-model"
    />
  );

  expect(getButtons()[0]?.textContent).toContain('Google / Google Chrome AI');
});

it('does not show chrome-ai entries when only stored providers and models are passed', async () => {
  await renderUi(
    <AIModelSelector
      models={MODELS}
      onSelect={vi.fn()}
      providers={PROVIDERS}
      selectedModelId={null}
    />
  );

  await act(async () => {
    getButtons()[0]?.click();
  });

  expect(container?.textContent).not.toContain('Google Chrome AI');
  expect(container?.textContent).not.toContain('Google / Google Chrome AI');
});
it('closes only the open selector on Escape and restores its trigger focus', async () => {
  const parentKey = vi.fn();
  await renderUi(
    <div onKeyDown={parentKey}>
      <AIModelSelector
        models={MODELS}
        providers={PROVIDERS}
        selectedModelId="model-1"
        onSelect={vi.fn()}
      />
    </div>
  );
  const trigger = getButtons()[0]!;
  await act(async () => trigger.click());
  const input = container!.querySelector('input')!;
  expect(document.activeElement).toBe(input);
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(container!.querySelector('input')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(parentKey).not.toHaveBeenCalled();
  await act(async () =>
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
  );
  expect(parentKey).toHaveBeenCalledTimes(1);
});

it.each([true, false])('preserves model search and selection with compact=%s', async (compact) => {
  const onSelect = vi.fn();
  await renderUi(
    <CommandPressScope value={compact}>
      <AIModelSelector
        models={MODELS}
        providers={PROVIDERS}
        selectedModelId="model-1"
        onSelect={onSelect}
      />
    </CommandPressScope>
  );
  const trigger = getButtons()[0]!;
  expect(trigger.hasAttribute('data-command-press')).toBe(compact);
  await act(async () => trigger.click());
  const input = container!.querySelector<HTMLInputElement>('input')!;
  await act(async () => setInputValue(input, 'missing'));
  expect(container!.textContent).not.toContain('Llama 3.2');
  const clearName = translate('shared.ui.clearField').replace(
    '{field}',
    translate('aiModal.modelSearchPlaceholder')
  );
  const clear = getButtons().find((button) => button.getAttribute('aria-label') === clearName);
  expect(Boolean(clear)).toBe(true);
  if (clear) {
    await act(async () => clear.click());
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('');
    expect(container!.textContent).toContain('Llama 3.2');
    expect(onSelect).not.toHaveBeenCalled();
    const model = getButtons().find((button) => button.textContent?.includes('Llama 3.2'))!;
    await act(async () => model.click());
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('model-2');
  }
});

it.each([true, false])('selects a focused model by keyboard with compact=%s', async (compact) => {
  const onSelect = vi.fn();
  await renderUi(
    <CommandPressScope value={compact}>
      <AIModelSelector
        models={MODELS}
        providers={PROVIDERS}
        selectedModelId="model-1"
        onSelect={onSelect}
      />
    </CommandPressScope>
  );
  await act(async () => getButtons()[0]!.click());
  const model = getButtons().find((button) => button.textContent?.includes('Llama 3.2'))!;
  model.focus();
  await act(async () => model.click());
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('model-2');
  expect(document.activeElement).toBe(getButtons()[0]);
});

it('notifies only opening and retains the open search and selection when refreshed models arrive', async () => {
  const onOpen = vi.fn();
  const onSelect = vi.fn();
  const render = (models: AIModel[], disabled = false) =>
    renderUi(
      <AIModelSelector
        models={models}
        providers={PROVIDERS}
        selectedModelId="model-1"
        onSelect={onSelect}
        onOpen={onOpen}
        disabled={disabled}
      />
    );
  await render(MODELS);
  const trigger = getButtons()[0]!;
  await act(async () => trigger.click());
  expect(onOpen).toHaveBeenCalledOnce();
  const search = container!.querySelector('input')!;
  await act(async () => setInputValue(search, 'GPT'));
  await render([...MODELS, { ...MODELS[0]!, id: 'new', displayName: 'GPT refreshed' }]);
  expect(container!.querySelector('input')).toBe(search);
  expect(search.value).toBe('GPT');
  expect(document.activeElement).toBe(search);
  expect(container?.textContent).toContain('GPT refreshed');
  expect(trigger.textContent).toContain('OpenAI / GPT 4.1');
  expect(onSelect).not.toHaveBeenCalled();
  await act(async () => trigger.click());
  expect(onOpen).toHaveBeenCalledOnce();
  await render(MODELS, true);
  await act(async () => trigger.click());
  expect(onOpen).toHaveBeenCalledOnce();
});

it('keeps search and selection active in a detached settings catalog and restores trigger focus', async () => {
  const onSelect = vi.fn();
  await renderUi(
    <AIModelSelector
      portalMenu
      models={MODELS}
      providers={PROVIDERS}
      selectedModelId={null}
      onSelect={onSelect}
    />
  );
  const trigger = getButtons()[0]!;
  await act(async () => trigger.click());
  const menu = document.querySelector<HTMLElement>('[data-testid="dropdown-menu"]')!;
  expect(menu).not.toBeNull();
  expect(container?.contains(menu)).toBe(false);
  expect(menu.style.position).toBe('fixed');
  const search = menu.querySelector('input')!;
  await act(async () => {
    search.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    setInputValue(search, 'llama');
  });
  expect(document.querySelector('[data-testid="dropdown-menu"]')).toBe(menu);
  const option = Array.from(menu.querySelectorAll('button')).find(
    (button) => button.title === 'Llama 3.2'
  )!;
  await act(async () => option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(onSelect).toHaveBeenCalledWith('model-2');
  expect(document.querySelector('[data-testid="dropdown-menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
