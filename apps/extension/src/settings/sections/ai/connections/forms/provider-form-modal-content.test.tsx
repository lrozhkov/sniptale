// @vitest-environment jsdom

import { CommandPressScope } from '@sniptale/ui/control-language/press';

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../../platform/i18n';

const layoutPropsMock = vi.hoisted(() => vi.fn());

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => {
  const ReactModule = await import('react');

  return {
    ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
    ProductField: (props: {
      children: React.ReactNode;
      error?: string;
      hint?: string;
      label: string;
    }) => (
      <label>
        <span>{props.label}</span>
        {props.hint ? <span>{props.hint}</span> : null}
        {props.error ? <span>{props.error}</span> : null}
        {props.children}
      </label>
    ),
    ProductInput: ReactModule.forwardRef<
      HTMLInputElement,
      React.InputHTMLAttributes<HTMLInputElement> & {
        invalid?: boolean;
      }
    >(function ProductInput({ invalid, ...props }, ref) {
      return <input ref={ref} {...props} data-invalid={String(Boolean(invalid))} />;
    }),
    ProductModalBody: (props: {
      asForm?: boolean;
      children: React.ReactNode;
      className?: string;
      compact?: boolean;
      onSubmit?: (event: React.FormEvent) => void;
    }) => (
      <form className={props.className} data-compact={props.compact} onSubmit={props.onSubmit}>
        {props.children}
      </form>
    ),
  };
});

vi.mock('./layout', () => ({
  AiProvidersFormModalLayout: (props: {
    children: React.ReactNode;
    isEditing: boolean;
    isSaving: boolean;
    mode: 'provider';
    onClose: () => void;
    onSubmit: (event: React.FormEvent) => void;
  }) => {
    layoutPropsMock(props);
    return <section data-testid="provider-layout">{props.children}</section>;
  },
}));

import {
  ProviderFormModalContent,
  type ProviderFormModalContentProps,
} from './provider-form-modal-content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

function createProps(
  overrides: Partial<ProviderFormModalContentProps> = {}
): ProviderFormModalContentProps {
  return {
    apiKeyInputRef: { current: null },
    errors: {},
    formData: {
      baseUrl: 'https://api.openai.com/v1',
      name: 'OpenAI',
      connectionType: 'openai-compatible',
    },
    hasStoredApiKey: false,
    isEditing: false,
    isSaving: false,
    onApiKeyChange: vi.fn(),
    onConnectionTypeChange: vi.fn(),
    onManagementChange: vi.fn(),
    onBaseUrlChange: vi.fn(),
    onClose: vi.fn(),
    onNameChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
}

function getTextContent() {
  return container?.textContent ?? '';
}

beforeEach(() => {
  layoutPropsMock.mockReset();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  vi.restoreAllMocks();
});

it('renders create mode with a required API key label and default placeholder', async () => {
  await render(<ProviderFormModalContent {...createProps()} />);

  const passwordInput = container?.querySelector('input[type="password"]');
  const urlInput = container?.querySelector('input[type="url"]');
  expect(getTextContent()).toContain(
    translate('settings.aiProviders.providerApiKeyRequiredSuffix')
  );
  expect(getTextContent()).not.toContain(
    translate('settings.aiProviders.providerApiKeyCurrentSet')
  );
  expect(getTextContent()).toContain(translate('settings.aiProviders.providerApiUrlHint'));
  expect(passwordInput?.getAttribute('placeholder')).toBe(
    translate('settings.aiProviders.providerApiKeyCreatePlaceholder')
  );
  expect(passwordInput?.getAttribute('autocomplete')).toBe('new-password');
  expect(urlInput?.getAttribute('placeholder')).toBe(
    translate('settings.aiProviders.providerApiUrlPlaceholder')
  );
  expect(layoutPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isEditing: false,
      isSaving: false,
      mode: 'provider',
    })
  );
  expect(container?.querySelectorAll('label')).toHaveLength(5);
  expect(container?.querySelector('input[disabled]')).toBeNull();
});

it('renders edit mode with the stored-secret hint and edit placeholder', async () => {
  await render(
    <ProviderFormModalContent
      {...createProps({
        hasStoredApiKey: true,
        isEditing: true,
      })}
    />
  );

  const passwordInput = container?.querySelector('input[type="password"]');
  expect(getTextContent()).toContain(translate('settings.aiProviders.providerApiKeyCurrentSet'));
  expect(passwordInput?.getAttribute('placeholder')).toBe(
    translate('settings.aiProviders.providerApiKeyEditPlaceholder')
  );
});

it('renders re-entry guidance and validation errors when the stored secret is missing', async () => {
  await render(
    <ProviderFormModalContent
      {...createProps({
        errors: {
          apiKey: 'Missing key',
          baseUrl: 'Invalid URL',
          name: 'Missing name',
        },
        isEditing: true,
      })}
    />
  );

  expect(getTextContent()).toContain(translate('settings.aiProviders.providerApiKeyReentryHint'));
  expect(getTextContent()).toContain('Missing key');
  expect(getTextContent()).toContain('Invalid URL');
  expect(getTextContent()).toContain('Missing name');
  expect(container?.querySelector('input[disabled]')).toBeNull();
});

it('renders a recoverable submit error above the provider fields', async () => {
  await render(
    <ProviderFormModalContent
      {...createProps({
        errors: {
          submit: 'Save failed',
        },
      })}
    />
  );

  expect(container?.querySelector('[role="alert"]')?.textContent).toContain('Save failed');
});

it('wires provider field change handlers and submit through the layout body', async () => {
  const props = createProps();
  await render(<ProviderFormModalContent {...props} />);

  const nameInput = container?.querySelector<HTMLInputElement>('input[type="text"]');
  const urlInput = container?.querySelector<HTMLInputElement>('input[type="url"]');
  const passwordInput = container?.querySelector<HTMLInputElement>('input[type="password"]');
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  if (!nameInput || !urlInput || !passwordInput || !valueSetter) {
    throw new Error('Expected provider form inputs');
  }

  await act(async () => {
    valueSetter.call(nameInput, 'Updated provider');
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    valueSetter.call(urlInput, 'https://api.example.com/v1');
    urlInput.dispatchEvent(new Event('input', { bubbles: true }));
    valueSetter.call(passwordInput, 'secret');
    passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
    container?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true }));
  });

  expect(props.onNameChange).toHaveBeenCalled();
  expect(props.onBaseUrlChange).toHaveBeenCalled();
  expect(props.onApiKeyChange).toHaveBeenCalled();
  expect(props.onSubmit).toHaveBeenCalled();
});

it('clears ordinary provider text through its input owner and leaves the secret field masked', async () => {
  let changedName = 'OpenAI';
  const props = createProps({
    onNameChange: (event) => {
      changedName = event.currentTarget.value;
    },
  });
  await render(
    <CommandPressScope value={true}>
      <ProviderFormModalContent {...props} />
    </CommandPressScope>
  );
  const name = container!.querySelector<HTMLInputElement>('input[type="text"]')!;
  const clear = name.parentElement!.querySelector<HTMLButtonElement>('.sniptale-field-clear')!;
  await act(async () => clear.click());
  expect(changedName).toBe('');
  expect(document.activeElement).toBe(name);
  const secret = container!.querySelector<HTMLInputElement>('input[type="password"]')!;
  expect(secret.value).toBe('');
  expect(secret.title).toBe('');
  expect(secret.parentElement!.querySelector('.sniptale-field-clear')).toBeNull();
});

it('offers provider and management controls and does not require a key for Ollama', async () => {
  const props = createProps({
    formData: {
      connectionType: 'ollama',
      baseUrl: 'http://localhost:11434/api',
      name: 'Ollama',
      management: 'automatic',
    },
  });
  await render(<ProviderFormModalContent {...props} />);
  expect(container?.querySelector('input[type="password"]')).toBeNull();
  expect(container?.textContent).toContain(translate('settings.aiProviders.providerAutomaticHint'));
  expect(container?.querySelectorAll('button[aria-haspopup="listbox"]')).toHaveLength(2);
  expect(
    container?.querySelector('button[aria-haspopup="listbox"]')?.getAttribute('aria-label')
  ).toBe(translate('settings.aiProviders.providerTypeLabel'));
  expect(container?.querySelector('input[type="text"]')?.getAttribute('aria-label')).toBe(
    translate('settings.aiProviders.providerNameLabel')
  );
});

it.each(['openai', 'anthropic', 'neuraldeep'] as const)(
  'discloses the optional %s address through advanced settings',
  async (connectionType) => {
    const { getAIProviderDefinition } =
      await import('../../../../../contracts/settings/ai-provider');
    const definition = getAIProviderDefinition(connectionType);
    await render(
      <ProviderFormModalContent
        {...createProps({
          formData: { connectionType, baseUrl: definition.baseUrl, name: definition.label },
        })}
      />
    );
    const details = container?.querySelector('details');
    expect(details).toBeTruthy();
    expect(details?.open).toBe(false);
    expect(details?.querySelector('input[type="url"]')).toBeTruthy();
    await act(async () => details?.querySelector('summary')?.click());
    expect(details?.open).toBe(true);
  }
);

it('exposes custom preset addresses and address errors without disclosure', async () => {
  for (const baseUrl of ['https://custom.example/v1', 'https://api.openai.com/v1']) {
    await render(
      <ProviderFormModalContent
        {...createProps({
          formData: { connectionType: 'openai', baseUrl, name: 'OpenAI' },
          errors: { baseUrl: 'Invalid address' },
        })}
      />
    );
    const details = container?.querySelector('details');
    expect(details === null || details?.open).toBe(true);
    expect(container?.querySelector('input[type="url"]')).toBeTruthy();
    expect(container?.textContent).toContain('Invalid address');
  }
});

it('keeps address focus and draft when advanced preset editing changes the destination', async () => {
  const props = createProps({
    formData: { connectionType: 'openai', baseUrl: 'https://api.openai.com/v1', name: 'OpenAI' },
  });
  props.onBaseUrlChange = (event) => {
    props.formData = { ...props.formData, baseUrl: event.currentTarget.value };
    root?.render(<ProviderFormModalContent {...props} />);
  };
  await render(<ProviderFormModalContent {...props} />);
  await act(async () => container?.querySelector('summary')?.click());
  const input = container!.querySelector<HTMLInputElement>('input[type="url"]')!;
  input.focus();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'https://custom.example/v1'
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(container?.querySelector('input[type="url"]')).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe('https://custom.example/v1');
  expect(container?.querySelector('details')?.open).toBe(true);
});

it('offers supported connections without the separate browser runtime or unsupported providers', async () => {
  await render(<ProviderFormModalContent {...createProps()} />);
  const trigger = container!.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('settings.aiProviders.providerTypeLabel')}"]`
  )!;
  await act(async () => trigger.click());
  const options = Array.from(document.querySelectorAll('[role="option"]'));
  expect(options).toHaveLength(19);
  expect(options[0]?.textContent).toBe('OpenAI-compatible');
  expect(options.some((option) => /Chrome AI|Sber|GigaChat/iu.test(option.textContent ?? ''))).toBe(
    false
  );
});
