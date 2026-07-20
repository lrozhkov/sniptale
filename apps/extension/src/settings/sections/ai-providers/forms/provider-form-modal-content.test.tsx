// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';

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
    },
    hasStoredApiKey: false,
    isEditing: false,
    isSaving: false,
    onApiKeyChange: vi.fn(),
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
  expect(container?.querySelectorAll('label')).toHaveLength(4);
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
  expect(container?.querySelector('input[disabled]')?.getAttribute('value')).toBe(
    translate('settings.aiProviders.providerConnectionTypeValue')
  );
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
