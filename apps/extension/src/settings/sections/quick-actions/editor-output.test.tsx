// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuickAction } from '../../../contracts/settings';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductSelect: (props: {
    disabled?: boolean;
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) => (
    <select
      disabled={props.disabled}
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
}));

vi.mock('../../section-surface/panel-controls', () => ({
  getSettingsHoverActionsClassName: (visible: boolean) => (visible ? 'visible' : 'hidden'),
  settingsAddButtonClassName: 'add-button',
  settingsCardClassName: 'settings-card',
  settingsDangerIconButtonClassName: 'danger-button',
  settingsEmptyStateClassName: 'empty-state',
  settingsInfoIconButtonClassName: 'info-button',
  settingsListRowClassName: 'list-row',
  settingsModalFieldSurfaceClassName: 'field-surface',
  settingsNeutralBadgeClassName: 'neutral-badge',
  settingsSuccessBadgeClassName: 'success-badge',
  SettingsDragHandle: () => <div data-testid="drag-handle">drag</div>,
  SettingsRange: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="range" {...props} />
  ),
  SettingsSwitch: (props: { checked: boolean; onClick: () => void }) => (
    <button type="button" onClick={props.onClick}>
      {String(props.checked)}
    </button>
  ),
}));

vi.mock('../../section-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../section-surface')>()),
  settingsMetaLabelClassName: 'meta-label',
  settingsToggleRowClassName: 'toggle-row',
}));

import {
  QuickActionsEditorAdvancedOutputFields,
  QuickActionsEditorPrimaryOutputField,
  QuickActionsEditorToggleRow,
} from './editor-output';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createEditForm(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    afterCapture: 'download_default',
    exitAfterCapture: false,
    icon: 'camera',
    id: 'quick-action-1',
    imageFormat: 'jpeg',
    imageQuality: null,
    name: 'Capture',
    screenshotMode: 'visible',
    status: true,
    ...overrides,
  };
}

function createState(overrides: { editForm?: Partial<QuickAction> } = {}) {
  return {
    editForm: createEditForm(overrides.editForm),
    updateFormField: vi.fn(),
  };
}

async function renderOutput(state: ReturnType<typeof createState>, includeExitAfterCapture = true) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <>
        <QuickActionsEditorPrimaryOutputField state={state} />
        <QuickActionsEditorAdvancedOutputFields state={state} />
        <QuickActionsEditorToggleRow
          state={state}
          includeExitAfterCapture={includeExitAfterCapture}
        />
      </>
    );
  });
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

describe('quick actions editor output', () => {
  it('wires primary, advanced, and toggle-row output controls', async () => {
    const state = createState();
    await renderOutput(state);

    const selects = Array.from(container?.querySelectorAll<HTMLSelectElement>('select') ?? []);
    const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

    act(() => {
      selects[0]!.value = 'copy';
      selects[0]!.dispatchEvent(new Event('change', { bubbles: true }));
      selects[1]!.value = 'png';
      selects[1]!.dispatchEvent(new Event('change', { bubbles: true }));
      selects[2]!.value = '80';
      selects[2]!.dispatchEvent(new Event('change', { bubbles: true }));
      selects[2]!.value = '';
      selects[2]!.dispatchEvent(new Event('change', { bubbles: true }));
      buttons.forEach((button) => button.click());
    });

    expect(state.updateFormField).toHaveBeenCalledWith('afterCapture', 'copy');
    expect(state.updateFormField).toHaveBeenCalledWith('imageFormat', 'png');
    expect(state.updateFormField).toHaveBeenCalledWith('imageQuality', 80);
    expect(state.updateFormField).toHaveBeenCalledWith('imageQuality', null);
    expect(state.updateFormField).toHaveBeenCalledWith('status', false);
    expect(state.updateFormField).toHaveBeenCalledWith('exitAfterCapture', true);
  });

  it('disables quality selection for PNG output and omits the exit toggle when excluded', async () => {
    const state = createState({
      editForm: {
        afterCapture: 'download_default',
        exitAfterCapture: false,
        imageFormat: 'png',
        imageQuality: null,
        status: true,
      },
    });

    await renderOutput(state, false);

    const selects = Array.from(container?.querySelectorAll<HTMLSelectElement>('select') ?? []);
    const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

    expect(selects[2]?.disabled).toBe(true);
    expect(buttons).toHaveLength(1);
  });
});
