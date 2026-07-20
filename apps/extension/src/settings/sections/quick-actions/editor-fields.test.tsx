// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSectionState } from './state.test-helpers';

const { productSelectPropsSpy, hotkeyInputPropsSpy } = vi.hoisted(() => ({
  productSelectPropsSpy: vi.fn(),
  hotkeyInputPropsSpy: vi.fn(),
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  ProductSelect: (props: {
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) => {
    productSelectPropsSpy(props);
    return (
      <select value={props.value} onChange={(event) => props.onChange(event.currentTarget.value)}>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  },
}));

vi.mock('./hotkey-input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./hotkey-input')>()),
  HotkeyInput: (props: {
    onChange: (hotkey: unknown) => void;
    onError: (message: string) => void;
  }) => {
    hotkeyInputPropsSpy(props);
    return (
      <button
        onClick={() => {
          props.onChange({ key: 'K' });
          props.onError('bad-hotkey');
        }}
      >
        hotkey
      </button>
    );
  },
}));

import {
  QuickActionsEditorIdentityFields,
  QuickActionsEditorPrimaryCaptureFields,
  QuickActionsEditorSecondaryCaptureFields,
} from './editor-fields';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState() {
  return createSectionState({
    editForm: {
      id: 'action-1',
      origin: 'user',
      bundledId: null,
      name: 'Action',
      icon: 'Camera',
      hotkey: null,
      screenshotMode: 'visible',
      emulation: null,
      delay: null,
      afterCapture: 'download_default',
      exitAfterCapture: false,
      imageFormat: null,
      imageQuality: null,
      status: true,
    },
    handleHotkeyError: vi.fn(),
    updateFormField: vi.fn(),
  });
}

function renderFields() {
  const state = createState();

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <div>
        <QuickActionsEditorIdentityFields state={state} />
        <QuickActionsEditorPrimaryCaptureFields state={state} />
        <QuickActionsEditorSecondaryCaptureFields
          state={state}
          viewportPresets={[{ id: 'preset-1', label: 'Desktop', width: 1440, height: 900 }]}
        />
      </div>
    );
  });

  return state;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  productSelectPropsSpy.mockReset();
  hotkeyInputPropsSpy.mockReset();
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

function verifyQuickActionEditorFieldInteractions() {
  const state = renderFields();
  const inputs = Array.from(container?.querySelectorAll<HTMLInputElement>('input') ?? []);
  const selects = Array.from(container?.querySelectorAll<HTMLSelectElement>('select') ?? []);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  act(() => {
    setValue?.call(inputs[0], 'Updated action');
    inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }));
    container?.querySelector<HTMLButtonElement>('button[title="Monitor"]')?.click();
    container?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.textContent === 'hotkey') {
        button.click();
      }
    });
    selects[0]!.value = 'full';
    selects[0]!.dispatchEvent(new Event('change', { bubbles: true }));
    selects[1]!.value = 'preset-1';
    selects[1]!.dispatchEvent(new Event('change', { bubbles: true }));
    selects[1]!.value = 'native';
    selects[1]!.dispatchEvent(new Event('change', { bubbles: true }));
    selects[2]!.value = '5';
    selects[2]!.dispatchEvent(new Event('change', { bubbles: true }));
    selects[2]!.value = '';
    selects[2]!.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(state.updateFormField).toHaveBeenCalledWith('name', 'Updated action');
  expect(state.updateFormField).toHaveBeenCalledWith('icon', 'Monitor');
  expect(state.updateFormField).toHaveBeenCalledWith('hotkey', { key: 'K' });
  expect(state.handleHotkeyError).toHaveBeenCalledWith('bad-hotkey');
  expect(state.updateFormField).toHaveBeenCalledWith('screenshotMode', 'full');
  expect(state.updateFormField).toHaveBeenCalledWith('emulation', 'preset-1');
  expect(state.updateFormField).toHaveBeenCalledWith('emulation', null);
  expect(state.updateFormField).toHaveBeenCalledWith('delay', 5);
  expect(state.updateFormField).toHaveBeenCalledWith('delay', null);
}

describe('quick-actions-editor-fields', () => {
  it(
    'wires identity, hotkey, emulation, and delay field handlers',
    verifyQuickActionEditorFieldInteractions
  );
});
