// @vitest-environment jsdom

import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import type { ViewportPreset } from '../../../../contracts/settings';
import { AddViewportPresetButton } from './add-button';
import { DefaultViewportField } from './default-viewport';
import { PresetsHeader } from './header';
import { PresetsList } from './list/view';
import { ViewportConfirmDialog } from './viewport-confirm-dialog';

const { confirmDialogPropsSpy, productSelectPropsSpy } = vi.hoisted(() => ({
  confirmDialogPropsSpy: vi.fn(),
  productSelectPropsSpy: vi.fn(),
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

    return props.isOpen ? (
      <div data-testid="confirm-dialog">
        <button onClick={() => void props.onConfirm()}>{props.confirmText}</button>
        <button onClick={props.onCancel}>{props.cancelText}</button>
      </div>
    ) : null;
  },
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

function render(node: ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  confirmDialogPropsSpy.mockReset();
  productSelectPropsSpy.mockReset();
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

it('renders the header and default field', () => {
  render(
    <div>
      <PresetsHeader />
      <DefaultViewportField
        defaultViewportId="native"
        isLoading={false}
        onChange={vi.fn(async () => undefined)}
        viewportPresets={[createPreset()]}
      />
    </div>
  );

  expect(container?.textContent).toContain(translate('settings.navigation.presets'));
  expect(productSelectPropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({
      options: expect.arrayContaining([
        expect.objectContaining({ value: 'native' }),
        expect.objectContaining({ value: 'preset-1' }),
      ]),
    })
  );
});

it('renders empty and populated presets lists', () => {
  const preset = createPreset();

  render(
    <div>
      <PresetsList
        hoveredViewportId={null}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onHoverChange={vi.fn()}
        presetsCountLabel="presets"
        viewportPresets={[]}
      />
      <PresetsList
        hoveredViewportId={preset.id}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onHoverChange={vi.fn()}
        presetsCountLabel="presets"
        viewportPresets={[preset]}
      />
    </div>
  );

  expect(container?.textContent).toContain(translate('viewportPresets.section.emptyTitle'));
  expect(container?.textContent).toContain(preset.label);
});

it('wires add button and confirm dialog actions', () => {
  const onAdd = vi.fn();
  const onConfirm = vi.fn(async () => undefined);
  const onCancel = vi.fn();

  render(
    <div>
      <AddViewportPresetButton onClick={onAdd} />
      <ViewportConfirmDialog
        viewportConfirmOpen
        deleteMessage="Delete Desktop?"
        confirmDeleteViewport={onConfirm}
        closeViewportDeleteDialog={onCancel}
        isLoading={false}
      />
    </div>
  );

  const buttons = container?.querySelectorAll<HTMLButtonElement>('button');
  buttons?.[0]?.click();
  buttons?.[1]?.click();
  buttons?.[2]?.click();

  expect(onAdd).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(confirmDialogPropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({ isOpen: true, message: 'Delete Desktop?' })
  );
});
