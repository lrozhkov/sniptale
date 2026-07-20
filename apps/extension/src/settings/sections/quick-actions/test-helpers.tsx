// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';

import type { ViewportPreset } from '../../../contracts/settings';
import { type QuickActionsSectionHarnessState } from './state.test-helpers';

const hoistedSpies = vi.hoisted(() => ({
  useHotkeyInputControllerSpy: vi.fn(),
  useQuickActionsControllerSpy: vi.fn(),
  useSettingsStoreSpy: vi.fn(),
}));

const { useHotkeyInputControllerSpy, useQuickActionsControllerSpy, useSettingsStoreSpy } =
  hoistedSpies;

export { useQuickActionsControllerSpy };

function createSettingsPanelControlMocks() {
  return {
    getSettingsHoverActionsClassName: (isHovered: boolean) =>
      isHovered ? 'hover-actions' : 'hidden',
    settingsAddButtonClassName: 'settings-add-button',
    settingsCardClassName: 'settings-card',
    settingsDangerIconButtonClassName: 'settings-danger-icon-button',
    settingsEmptyStateClassName: 'settings-empty-state',
    settingsInfoIconButtonClassName: 'settings-info-icon-button',
    settingsListRowClassName: 'settings-list-row',
    settingsModalFieldSurfaceClassName: 'settings-modal-field-surface',
    SettingsDragHandle: () => <span data-testid="settings-drag-handle">drag</span>,
    SettingsSwitch: (props: {
      checked: boolean;
      onClick: () => void | Promise<void>;
      title?: string;
    }) => (
      <button
        data-checked={String(props.checked)}
        data-testid="settings-switch"
        title={props.title}
        onClick={() => void props.onClick()}
      >
        {String(props.checked)}
      </button>
    ),
  };
}

type HotkeyInputControllerState = {
  displayValue: string;
  handleBlur: () => void;
  handleClear: (event?: React.MouseEvent) => void;
  handleFocus: () => void;
  handleKeyDown: (event?: React.KeyboardEvent) => void;
  inputRef: { current: HTMLDivElement | null };
  isRecording: boolean;
};

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('../../runtime/store/useSettingsStore', () => ({
  useSettingsStore: () =>
    useSettingsStoreSpy() as {
      settings: { viewportPresets: ViewportPreset[] };
    },
}));

vi.mock('./controller', () => ({
  useQuickActionsController: () =>
    useQuickActionsControllerSpy() as QuickActionsSectionHarnessState,
}));

vi.mock('./hotkey-input/controller', () => ({
  useHotkeyInputController: (args: unknown) =>
    useHotkeyInputControllerSpy(args) as HotkeyInputControllerState,
}));

vi.mock('../../section-surface/loading-state', () => ({
  DelayedSettingsCardLoadingState: () => <div data-testid="settings-card-loading">loading</div>,
}));

vi.mock('../../section-surface/panel-controls', () => createSettingsPanelControlMocks());

import { QuickActionsSection } from '.';

const VIEWPORT_PRESETS: ViewportPreset[] = [
  { id: 'desktop-1440', label: 'Desktop', width: 1440, height: 900 },
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

export { createSectionState } from './state.test-helpers';

export function getQuickActionsContainer() {
  return container;
}

export async function renderQuickActionsSection() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<QuickActionsSection />);
  });
}

export function setSelectValue(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export function dispatchUiEvent(type: string, element: Element) {
  const event = new Event(type, { bubbles: true, cancelable: true });

  act(() => {
    element.dispatchEvent(event);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useSettingsStoreSpy.mockReset();
  useQuickActionsControllerSpy.mockReset();
  useHotkeyInputControllerSpy.mockReset();
  useSettingsStoreSpy.mockReturnValue({
    settings: {
      viewportPresets: VIEWPORT_PRESETS,
    },
  });
  useHotkeyInputControllerSpy.mockReturnValue({
    displayValue: 'Ctrl+Shift+K',
    handleBlur: vi.fn(),
    handleClear: vi.fn(),
    handleFocus: vi.fn(),
    handleKeyDown: vi.fn(),
    inputRef: { current: null },
    isRecording: false,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
