// @vitest-environment jsdom

import { forwardRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import type { AIProvider } from '../../../../contracts/settings';

const { layoutPropsSpy } = vi.hoisted(() => ({
  layoutPropsSpy: vi.fn(),
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductSelect: (props: {
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) => (
    <select
      aria-label="provider-select"
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  ProductField: (props: { children: React.ReactNode; error?: string; label: string }) => (
    <label>
      <span>{props.label}</span>
      {props.error ? <span>{props.error}</span> : null}
      {props.children}
    </label>
  ),
  ProductInput: ({
    invalid: _invalid,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) => <input {...props} />,
  ProductTextarea: forwardRef<
    HTMLTextAreaElement,
    React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
  >(({ invalid: _invalid, ...props }, ref) => <textarea ref={ref} {...props} />),
}));

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={props.onClick}>{props.children}</button>
  ),
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModal: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalBody: (
    props: React.FormHTMLAttributes<HTMLFormElement> & { children: React.ReactNode }
  ) => <form onSubmit={props.onSubmit}>{props.children}</form>,
}));

vi.mock('./layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./layout')>()),
  AiProvidersFormModalLayout: (props: {
    children: React.ReactNode;
    isEditing: boolean;
    isSaving: boolean;
    mode: 'model' | 'provider';
    onClose: () => void;
    onSubmit: (event: React.FormEvent) => void;
  }) => {
    layoutPropsSpy(props);
    return (
      <div>
        <button type="button" onClick={(event) => props.onSubmit(event)}>
          submit
        </button>
        {props.children}
      </div>
    );
  },
}));

import { ModelFormModalContent } from './model-form-modal-content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProvider(): AIProvider {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Provider One',
    connectionType: 'openai-compatible',
    baseUrl: 'https://example.com/v1',
    hasStoredApiKey: true,
    createdAt: 1,
  };
}

function createProps(
  overrides: Partial<Parameters<typeof ModelFormModalContent>[0]> = {}
): Parameters<typeof ModelFormModalContent>[0] {
  return {
    errors: {},
    formData: {
      displayName: 'Model One',
      modelCode: 'gpt-4o',
      providerId: '00000000-0000-4000-8000-000000000001',
      systemPrompt: 'Prompt',
    },
    isEditing: false,
    isSaving: false,
    onClose: vi.fn(),
    onDisplayNameChange: vi.fn(),
    onModelCodeChange: vi.fn(),
    onProviderChange: vi.fn(),
    onResizeStart: vi.fn(),
    onSubmit: vi.fn(),
    onSystemPromptChange: vi.fn(),
    providers: [createProvider()],
    textareaRef: { current: null },
    ...overrides,
  };
}

function renderContent(overrides: Partial<Parameters<typeof ModelFormModalContent>[0]> = {}) {
  const props = createProps(overrides);

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ModelFormModalContent {...props} />);
  });

  return props;
}

beforeEach(() => {
  layoutPropsSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function verifyMissingProvidersState() {
  const props = renderContent({ providers: [] });

  act(() => {
    container?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click());
  });

  expect(container?.textContent).toContain(
    translate('settings.aiProviders.modelModalMissingProvidersTitle')
  );
  expect(props.onClose).toHaveBeenCalledTimes(1);
}

function dispatchModelFormInputs() {
  const [displayNameInput, modelCodeInput] = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input') ?? []
  );
  const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  const setTextareaValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  const select = container?.querySelector<HTMLSelectElement>(
    'select[aria-label="provider-select"]'
  );

  if (select) {
    select.value = createProvider().id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  setInputValue?.call(displayNameInput, 'Updated model');
  displayNameInput?.dispatchEvent(new Event('input', { bubbles: true }));
  setInputValue?.call(modelCodeInput, 'updated-code');
  modelCodeInput?.dispatchEvent(new Event('input', { bubbles: true }));
  const textarea = container?.querySelector<HTMLTextAreaElement>('textarea');
  setTextareaValue?.call(textarea, 'Updated prompt');
  textarea?.dispatchEvent(new Event('input', { bubbles: true }));
}

function dispatchModelFormActions() {
  container
    ?.querySelector<HTMLElement>('.cursor-ns-resize')
    ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  container?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    if (button.textContent === 'submit') {
      button.click();
    }
  });
}

function verifyModelFormInteractions() {
  const props = renderContent();

  act(() => {
    dispatchModelFormInputs();
    dispatchModelFormActions();
  });

  expect(layoutPropsSpy).toHaveBeenCalled();
  expect(layoutPropsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      isEditing: false,
      isSaving: false,
      mode: 'model',
    })
  );
  expect(props.onProviderChange).toHaveBeenCalled();
  expect(props.onDisplayNameChange).toHaveBeenCalled();
  expect(props.onModelCodeChange).toHaveBeenCalled();
  expect(props.onSystemPromptChange).toHaveBeenCalled();
  expect(props.onResizeStart).toHaveBeenCalled();
  expect(props.onSubmit).toHaveBeenCalled();
  expect(container?.querySelectorAll('label')).toHaveLength(4);
}

function verifySubmitErrorNotice() {
  renderContent({
    errors: {
      submit: 'Save failed',
    },
  });

  expect(container?.querySelector('[role="alert"]')?.textContent).toContain('Save failed');
  expect(container?.querySelectorAll('form')).toHaveLength(1);
}

function verifyFieldLevelErrors() {
  renderContent({
    errors: {
      displayName: 'Missing model name',
      modelCode: 'Missing model code',
      providerId: 'Missing provider',
      systemPrompt: 'Prompt invalid',
    },
  });

  expect(container?.textContent).toContain('Missing provider');
  expect(container?.textContent).toContain('Missing model name');
  expect(container?.textContent).toContain('Missing model code');
  expect(container?.textContent).toContain('Prompt invalid');
}

function runModelFormModalContentSuite() {
  it('renders the missing-provider fallback and closes it', verifyMissingProvidersState);
  it(
    'renders the model form inside the layout and wires all field handlers',
    verifyModelFormInteractions
  );
  it('renders a recoverable submit error above the form fields', verifySubmitErrorNotice);
  it('surfaces field-level validation errors for every model input', verifyFieldLevelErrors);
}

describe('ModelFormModalContent', runModelFormModalContentSuite);
