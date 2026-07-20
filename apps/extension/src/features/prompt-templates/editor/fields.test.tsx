// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PromptTemplateEditorFields } from './fields';
import { usePromptTemplateEditorState } from './use-state';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

type PromptTemplateEditorState = ReturnType<typeof usePromptTemplateEditorState>;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(
  overrides: Partial<PromptTemplateEditorState> = {}
): PromptTemplateEditorState {
  return {
    actions: {
      handleKeyDown: vi.fn(),
      handleSubmit: vi.fn(),
    },
    fields: {
      content: 'Draft body',
      name: 'Draft name',
      nameInputRef: { current: null },
      setContent: vi.fn(),
      setName: vi.fn(),
    },
    validation: {
      errors: {},
      isDisabled: false,
      setErrors: vi.fn(),
    },
    ...overrides,
  };
}

async function renderFields(
  props: {
    isLoading?: boolean;
    state?: PromptTemplateEditorState;
  } = {}
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const state = props.state ?? createState();

  await act(async () => {
    root?.render(<PromptTemplateEditorFields isLoading={props.isLoading ?? false} state={state} />);
  });

  return state;
}

function setFieldValue(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function verifyFieldRendering() {
  it('renders both field surfaces and forwards name/content changes', async () => {
    const state = await renderFields();
    const inputs = container?.querySelectorAll('input, textarea') ?? [];

    expect(container?.querySelectorAll('.sniptale-modal-field-surface')).toHaveLength(2);
    expect(container?.textContent).toContain('templates.editor.nameLabel');
    expect(container?.textContent).toContain('templates.editor.contentLabel');

    await act(async () => {
      setFieldValue(inputs[0] as HTMLInputElement, 'Updated name');
      setFieldValue(inputs[1] as HTMLTextAreaElement, 'Updated body');
    });

    expect(state.fields.setName).toHaveBeenCalledWith('Updated name');
    expect(state.fields.setContent).toHaveBeenCalledWith('Updated body');
    expect(state.validation.setErrors).toHaveBeenCalledTimes(2);
  });
}

function verifyLoadingState() {
  it('shows field errors and disables controls while loading', async () => {
    await renderFields({
      isLoading: true,
      state: createState({
        validation: {
          ...createState().validation,
          errors: {
            content: 'templates.editor.contentRequired',
            name: 'templates.editor.nameRequired',
          },
        },
      }),
    });

    const inputs = Array.from(container?.querySelectorAll('input, textarea') ?? []);

    expect(container?.textContent).toContain('templates.editor.nameRequired');
    expect(container?.textContent).toContain('templates.editor.contentRequired');
    expect(inputs.every((input) => input.hasAttribute('disabled'))).toBe(true);
  });
}

function verifyErrorClearCallbacks() {
  it('clears only the changed field error through the updater callbacks', async () => {
    const state = await renderFields({
      state: createState({
        validation: {
          ...createState().validation,
          errors: {
            content: 'templates.editor.contentRequired',
            name: 'templates.editor.nameRequired',
          },
        },
      }),
    });

    const inputs = Array.from(container?.querySelectorAll('input, textarea') ?? []);

    await act(async () => {
      setFieldValue(inputs[0] as HTMLInputElement, 'Updated name');
      setFieldValue(inputs[1] as HTMLTextAreaElement, 'Updated body');
    });

    const clearNameError = vi.mocked(state.validation.setErrors).mock.calls[0]?.[0];
    const clearContentError = vi.mocked(state.validation.setErrors).mock.calls[1]?.[0];

    expect(typeof clearNameError).toBe('function');
    expect(typeof clearContentError).toBe('function');

    expect(
      (clearNameError as (value: { name: string; content: string }) => unknown)({
        name: 'name',
        content: 'content',
      })
    ).toEqual({
      content: 'content',
    });
    expect(
      (clearContentError as (value: { name: string; content: string }) => unknown)({
        name: 'name',
        content: 'content',
      })
    ).toEqual({
      name: 'name',
    });
  });
}

function runPromptTemplateEditorFieldsSuite() {
  verifyFieldRendering();
  verifyLoadingState();
  verifyErrorClearCallbacks();
}

describe('PromptTemplateEditorFields', runPromptTemplateEditorFieldsSuite);
