// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   preset template header proof keeps tab/card/save-panel interactions in one owner file */

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/editor-chrome', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/editor-chrome')>()),
  EditorDivider: () => <div data-testid="preset-divider" />,
}));
vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: (props: React.PropsWithChildren<Record<string, unknown>>) => (
    <button
      type="button"
      data-testid={`action-${String(props['children'])}`}
      aria-pressed={props['aria-pressed'] as boolean | undefined}
      disabled={Boolean(props['disabled'])}
      onClick={props['onClick'] as React.MouseEventHandler<HTMLButtonElement>}
      className={String(props['className'] ?? '')}
    >
      {props.children}
    </button>
  ),
}));

vi.mock('@sniptale/ui/control-language', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/control-language')>()),
  getControlPrimaryButtonClassName: () => 'primary-button',
  getControlSecondaryButtonClassName: () => 'secondary-button',
  getControlSegmentedOptionClassName: () => 'idle-segment',
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  TextField: (props: Record<string, unknown>) => (
    <input data-testid={`input-${String(props['aria-label'])}`} {...props} />
  ),
  SelectField: (props: Record<string, unknown>) => (
    <select
      data-testid={`select-${String(props['label'])}`}
      value={String(props['value'])}
      onChange={(event) =>
        (props['onChange'] as (value: string) => void)?.(event.currentTarget.value)
      }
    >
      {((props['options'] as Array<{ label: string; value: string }>) ?? []).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { EditorInspectorPresetHeader } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(
  overrides: Partial<Parameters<typeof EditorInspectorPresetHeader>[0]['state']> = {}
): Parameters<typeof EditorInspectorPresetHeader>[0]['state'] {
  return {
    activeView: 'parameters',
    saveDisabled: false,
    savePanel: null,
    templates: [
      {
        id: 'template-1',
        label: 'Template 1',
        preview: <span data-testid="preview-1" />,
        selected: true,
        onApply: vi.fn(),
      },
      {
        id: 'template-2',
        label: 'Template 2',
        preview: <span data-testid="preview-2" />,
        selected: false,
        onApply: vi.fn(),
      },
    ],
    onOpenSavePanel: vi.fn(),
    onViewChange: vi.fn(),
    ...overrides,
  };
}

async function renderHeader(
  state: Parameters<typeof EditorInspectorPresetHeader>[0]['state'],
  children: React.ReactNode = <div data-testid="parameter-content">parameters</div>
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <EditorInspectorPresetHeader state={state}>{children}</EditorInspectorPresetHeader>
    );
  });
}

function setSearchValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
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

describe('EditorInspectorPresetHeader', () => {
  it('renders the two-tab switch and parameter content by default', async () => {
    const state = createState();

    await renderHeader(state);

    expect(container?.textContent).toContain('editor.compact.templateParameters');
    expect(container?.textContent).toContain('editor.compact.templateSingle');
    expect(container?.querySelector('[data-editor-preset-view-switch="true"]')).not.toBeNull();
    expect(container?.querySelector('[data-testid="parameter-content"]')).not.toBeNull();
    expect(container?.querySelector('[data-editor-template-cards="true"]')).toBeNull();
    expect(container?.querySelector('[data-testid="preset-divider"]')).toBeNull();

    await act(async () => {
      Array.from(container?.querySelectorAll('button') ?? [])
        .find((button) => button.textContent === 'editor.compact.templateSingle')
        ?.click();
    });

    expect(state.onViewChange).toHaveBeenCalledWith('templates');
  });

  it('renders template cards and keeps the tab open after card apply', async () => {
    const apply = vi.fn();
    const systemApply = vi.fn();
    const state = createState({
      activeView: 'templates',
      groups: [
        {
          id: 'system',
          label: 'System templates',
          templates: [
            {
              id: 'system-template',
              label: 'System template',
              preview: <span data-testid="preview-system" />,
              selected: false,
              system: true,
              onApply: systemApply,
            },
          ],
        },
        {
          id: 'user',
          label: 'User templates',
          templates: [
            {
              id: 'template-1',
              label: 'Template 1',
              preview: <span data-testid="preview-1" />,
              selected: true,
              onApply: apply,
            },
          ],
        },
      ],
      templates: [
        {
          id: 'template-1',
          label: 'Template 1',
          preview: <span data-testid="preview-1" />,
          selected: true,
          onApply: apply,
        },
      ],
    });

    await renderHeader(state);

    expect(container?.querySelector('[data-testid="parameter-content"]')).toBeNull();
    expect(container?.querySelector('[data-editor-template-cards="true"]')).not.toBeNull();
    expect(container?.querySelector('[data-editor-template-card="template-1"]')).not.toBeNull();
    expect(container?.textContent).toContain('System templates');
    expect(container?.textContent).toContain('User templates');
    expect(
      container
        ?.querySelector('[data-editor-template-card="system-template"]')
        ?.getAttribute('data-preset-system')
    ).toBe('true');
    expect(
      container
        ?.querySelector('[data-editor-template-card="template-1"]')
        ?.getAttribute('aria-pressed')
    ).toBe('true');

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-editor-template-card="template-1"]')
        ?.click();
    });

    expect(apply).toHaveBeenCalledOnce();
    expect(state.onViewChange).not.toHaveBeenCalled();

    const searchField = container?.querySelector<HTMLInputElement>('input[type="search"]');
    await act(async () => {
      if (searchField) {
        setSearchValue(searchField, 'system');
      }
    });

    expect(container?.textContent).toContain('System templates');
    expect(container?.textContent).not.toContain('User templates');
    expect(
      container?.querySelector('[data-editor-template-card="system-template"]')
    ).not.toBeNull();
    expect(container?.querySelector('[data-editor-template-card="template-1"]')).toBeNull();
  });

  it('renders save-as-template enabled and disabled states', async () => {
    const state = createState({ saveDisabled: false });

    await renderHeader(state);

    const saveButton = container?.querySelector<HTMLButtonElement>(
      '[data-editor-template-save-trigger="true"]'
    );
    expect(saveButton?.disabled).toBe(false);
    expect(saveButton?.className).toContain('rounded-[10px]');

    await act(async () => {
      saveButton?.click();
    });

    expect(state.onOpenSavePanel).toHaveBeenCalledOnce();

    await renderHeader(createState({ saveDisabled: true }));

    expect(
      container?.querySelector<HTMLButtonElement>('[data-editor-template-save-trigger="true"]')
        ?.disabled
    ).toBe(true);
  });
});
