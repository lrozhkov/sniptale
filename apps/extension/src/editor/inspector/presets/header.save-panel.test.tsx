// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
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
}));

import { EditorInspectorPresetHeader } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

type PresetHeaderState = Parameters<typeof EditorInspectorPresetHeader>[0]['state'];

function createState(overrides: Partial<PresetHeaderState> = {}): PresetHeaderState {
  return {
    activeView: 'parameters',
    saveDisabled: false,
    savePanel: null,
    templates: [],
    onOpenSavePanel: vi.fn(),
    onViewChange: vi.fn(),
    ...overrides,
  };
}

async function renderHeader(state: PresetHeaderState) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <EditorInspectorPresetHeader state={state}>parameters</EditorInspectorPresetHeader>
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

describe('EditorInspectorPresetHeader create save panel', () => {
  it('renders create and overwrite save-panel UI', async () => {
    const onModeChange = vi.fn();
    const onSave = vi.fn();
    const onCancel = vi.fn();

    await renderHeader(
      createState({
        savePanel: {
          canSave: true,
          mode: 'overwrite',
          name: 'Template 3',
          overwriteDisabled: false,
          overwriteOptions: [{ label: 'Template 2', value: 'template-2' }],
          overwriteTargetId: 'template-2',
          onCancel,
          onModeChange,
          onNameChange: vi.fn(),
          onOverwriteTargetChange: vi.fn(),
          onSave,
        },
      })
    );

    expect(container?.querySelector('[data-editor-template-save-panel="true"]')).not.toBeNull();
    expect(
      container?.querySelector('[data-testid="select-editor.compact.templateOverwriteTarget"]')
    ).not.toBeNull();

    await act(async () => {
      Array.from(container?.querySelectorAll('button') ?? [])
        .find((button) => button.textContent === 'editor.compact.templateSaveModeCreate')
        ?.click();
      container
        ?.querySelector<HTMLButtonElement>('[data-testid="action-common.actions.save"]')
        ?.click();
      Array.from(container?.querySelectorAll('button') ?? [])
        .find((button) => button.textContent === 'editor.compact.cancel')
        ?.click();
    });

    expect(onModeChange).toHaveBeenCalledWith('create');
    expect(onSave).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('EditorInspectorPresetHeader empty and disabled states', () => {
  it('renders disabled overwrite mode and empty template state without old dropdown actions', async () => {
    const emptyState = createState({ activeView: 'templates' });
    await renderHeader(emptyState);

    expect(container?.textContent).toContain('editor.compact.noTemplatesAvailable');
    const templateSaveButton = Array.from(container?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'editor.compact.saveAsTemplate'
    );
    expect(templateSaveButton?.disabled).toBe(false);

    await act(async () => {
      templateSaveButton?.click();
    });

    expect(emptyState.onOpenSavePanel).toHaveBeenCalledOnce();
    expect(
      container?.querySelector('[data-editor-preset-trigger-actions-shell="true"]')
    ).toBeNull();
    expect(container?.querySelector('[data-testid^="select-preset"]')).toBeNull();

    await renderHeader(
      createState({
        savePanel: {
          canSave: false,
          mode: 'overwrite',
          name: '',
          overwriteDisabled: true,
          overwriteHint: 'disabled-overwrite',
          overwriteOptions: [],
          overwriteTargetId: '',
          onCancel: vi.fn(),
          onModeChange: vi.fn(),
          onNameChange: vi.fn(),
          onOverwriteTargetChange: vi.fn(),
          onSave: vi.fn(),
        },
      })
    );

    expect(container?.textContent).toContain('disabled-overwrite');
    expect(
      container?.querySelector('[data-testid="action-editor.compact.templateSaveModeOverwrite"]')
    ).toHaveProperty('disabled', true);
  });
});
