// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../platform/i18n';
import type { ViewportPreset } from '../../../contracts/settings';

const { confirmDialogPropsSpy, productSelectPropsSpy, viewportEditorPropsSpy } = vi.hoisted(() => ({
  confirmDialogPropsSpy: vi.fn(),
  productSelectPropsSpy: vi.fn(),
  viewportEditorPropsSpy: vi.fn(),
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductSelect: (props: {
    disabled?: boolean;
    onChange: (value: string) => Promise<void>;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) => {
    productSelectPropsSpy(props);

    return (
      <select
        aria-label="viewport-select"
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => void props.onChange(event.currentTarget.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  },
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: {
    cancelText: string;
    confirmText: string;
    isOpen: boolean;
    message: string;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
    title: string;
  }) => {
    confirmDialogPropsSpy(props);

    if (!props.isOpen) {
      return null;
    }

    return (
      <div data-testid="preset-confirm-dialog">
        <span>{props.title}</span>
        <span>{props.message}</span>
        <button onClick={() => void props.onConfirm()}>{props.confirmText}</button>
        <button onClick={props.onCancel}>{props.cancelText}</button>
      </div>
    );
  },
}));

vi.mock('./editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./editor')>()),
  ViewportPresetEditor: (props: {
    isLoading: boolean;
    isOpen: boolean;
    onClose: () => void;
    onSave: (label: string, width: number, height: number) => Promise<void>;
    preset?: ViewportPreset;
  }) => {
    viewportEditorPropsSpy(props);
    return props.isOpen ? (
      <div data-testid="viewport-editor">{props.preset?.label ?? 'new'}</div>
    ) : null;
  },
}));

import { PresetsSectionContent } from './section-content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createPreset(overrides: Partial<ViewportPreset> = {}): ViewportPreset {
  return {
    id: overrides.id ?? 'preset-1',
    label: overrides.label ?? 'Desktop',
    width: overrides.width ?? 1440,
    height: overrides.height ?? 900,
  };
}

function createProps(overrides: Partial<Parameters<typeof PresetsSectionContent>[0]> = {}) {
  return {
    closeViewportDeleteDialog: vi.fn(),
    closeViewportEditor: vi.fn(),
    confirmDeleteViewport: vi.fn(async () => undefined),
    defaultViewportId: 'native',
    deleteMessage: 'Delete this preset?',
    handleAddViewportPreset: vi.fn(),
    handleDefaultViewportChange: vi.fn(async () => undefined),
    handleDeleteViewportPreset: vi.fn(),
    handleEditViewportPreset: vi.fn(),
    handleSaveViewportPreset: vi.fn(async () => undefined),
    hoveredViewportId: null,
    isLoading: false,
    isViewportEditorOpen: false,
    presetsCountLabel: 'presets',
    setHoveredViewportId: vi.fn(),
    viewportConfirmOpen: false,
    viewportPresets: [],
    ...overrides,
  };
}

function renderSection(overrides: Partial<Parameters<typeof PresetsSectionContent>[0]> = {}) {
  const props = createProps(overrides);

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<PresetsSectionContent {...props} />);
  });

  return props;
}

function getButtonByTitle(title: string) {
  return container?.querySelector<HTMLButtonElement>(`button[title="${title}"]`) ?? null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  confirmDialogPropsSpy.mockReset();
  productSelectPropsSpy.mockReset();
  viewportEditorPropsSpy.mockReset();
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

function verifyEmptyPresetsStateAndNativeOption() {
  renderSection();

  expect(container?.textContent).toContain(translate('viewportPresets.section.emptyTitle'));
  expect(productSelectPropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({
      options: expect.arrayContaining([
        expect.objectContaining({
          value: 'native',
          label: translate('viewportPresets.section.nativeOption'),
        }),
      ]),
    })
  );
}

function verifyPresetActionsAndDialogs() {
  const preset = createPreset();
  const props = renderSection({
    deleteMessage: 'Delete Desktop?',
    editingViewport: preset,
    hoveredViewportId: preset.id,
    isViewportEditorOpen: true,
    viewportConfirmOpen: true,
    viewportPresets: [preset],
  });
  const select = container?.querySelector<HTMLSelectElement>(
    'select[aria-label="viewport-select"]'
  );
  const row = container?.querySelector(`div[class*="group"]`);

  act(() => {
    if (select) {
      select.value = preset.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    row?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    getButtonByTitle(translate('common.actions.edit'))?.click();
    getButtonByTitle(translate('common.actions.delete'))?.click();
    container?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.textContent?.includes(translate('viewportPresets.section.addButton'))) {
        button.click();
      }
      if (button.textContent === translate('common.actions.delete')) {
        button.click();
      }
      if (button.textContent === translate('common.actions.cancel')) {
        button.click();
      }
    });
    row?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
  });

  expect(props.handleDefaultViewportChange).toHaveBeenCalledWith(preset.id);
  expect(props.handleEditViewportPreset).toHaveBeenCalledWith(preset);
  expect(props.handleDeleteViewportPreset).toHaveBeenCalledWith(preset);
  expect(props.handleAddViewportPreset).toHaveBeenCalledTimes(1);
  expect(props.confirmDeleteViewport).toHaveBeenCalledTimes(1);
  expect(props.closeViewportDeleteDialog).toHaveBeenCalledTimes(1);
  expect(viewportEditorPropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({ isOpen: true, preset: expect.objectContaining({ id: preset.id }) })
  );
  expect(confirmDialogPropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({ isOpen: true, message: 'Delete Desktop?' })
  );
}

function runPresetsSectionContentSuite() {
  it(
    'renders the empty presets state and wires the native viewport option',
    verifyEmptyPresetsStateAndNativeOption
  );
  it(
    'routes viewport selection, row actions, hover state, and dialog flows',
    verifyPresetActionsAndDialogs
  );
}

describe('PresetsSectionContent', runPresetsSectionContentSuite);
