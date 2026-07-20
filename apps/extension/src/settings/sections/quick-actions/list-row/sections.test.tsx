// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { formatHotkeyMock, getQuickActionDisplayNameMock, isBundledQuickActionMock } = vi.hoisted(
  () => ({
    formatHotkeyMock: vi.fn(),
    getQuickActionDisplayNameMock: vi.fn(),
    isBundledQuickActionMock: vi.fn(),
  })
);

vi.mock('../../../../platform/i18n', () => ({
  AppLocale: undefined,
  DEFAULT_LOCALE: 'en',
  FALLBACK_LOCALE: 'en',
  SUPPORTED_LOCALES: ['en'],
  Translate: undefined,
  TranslationDictionary: undefined,
  TranslationKey: undefined,
  compareStrings: vi.fn(),
  createTranslator: vi.fn(),
  formatDateTime: vi.fn(),
  formatNumber: vi.fn(),
  getCurrentLocale: vi.fn(),
  getDictionary: vi.fn(),
  getStoredLocalePreference: vi.fn(),
  setLocalePreference: vi.fn(),
  subscribeToLocaleChanges: vi.fn(),
  translate: (key: string) => key,
  useAppLocale: vi.fn(),
  usePageLocaleMetadata: vi.fn(),
}));

vi.mock('../../../../features/quick-actions-presets/catalog', () => ({
  createBundledQuickAction: vi.fn(),
  getBundledQuickActionConfig: vi.fn(),
  DEFAULT_QUICK_ACTIONS_DISPLAY_MODE: 'list',
  getBundledQuickActions: vi.fn(),
  getQuickActionDisplayName: (action: { name: string }) => getQuickActionDisplayNameMock(action),
  isBundledQuickAction: (action: unknown) => isBundledQuickActionMock(action),
  mergeStoredQuickActions: vi.fn(),
  normalizeQuickAction: vi.fn(),
  sanitizeQuickActionsDisplayMode: vi.fn(),
}));

vi.mock('@sniptale/foundation/utils/delay', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/utils/delay')>()),
  delay: vi.fn(),
}));

vi.mock('../../../../platform/i18n/format-bytes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/format-bytes')>()),
  formatBytes: vi.fn(),
}));

vi.mock('../../../../features/keyboard-shortcuts/hotkey-format', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../features/keyboard-shortcuts/hotkey-format')
  >()),
  formatHotkey: (hotkey: unknown) => formatHotkeyMock(hotkey),
}));

vi.mock('@sniptale/foundation/utils/filename', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/utils/filename')>()),
  generateFilename: vi.fn(),
}));

vi.mock('@sniptale/foundation/utils/preset-path', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/foundation/utils/preset-path')>()),
  sanitizePresetPathInput: vi.fn(),
}));

vi.mock('../../../section-surface/panel-controls', () => ({
  getSettingsHoverActionsClassName: (isHovered: boolean) =>
    isHovered ? 'hover-actions' : 'hidden',
  settingsDangerIconButtonClassName: 'danger-button',
  settingsAddButtonClassName: 'add-button',
  settingsCardClassName: 'settings-card',
  settingsEmptyStateClassName: 'settings-empty',
  settingsInfoIconButtonClassName: 'info-button',
  settingsListRowClassName: 'settings-list-row',
  settingsModalFieldSurfaceClassName: 'settings-modal-field',
  settingsNeutralBadgeClassName: 'settings-neutral-badge',
  settingsSuccessBadgeClassName: 'settings-success-badge',
  SettingsDragHandle: () => <span data-testid="drag-handle">drag</span>,
  SettingsRange: () => <input data-testid="settings-range" />,
  SettingsSwitch: (props: {
    checked: boolean;
    onClick: () => void | Promise<void>;
    title?: string;
  }) => (
    <button
      data-checked={String(props.checked)}
      data-testid="status-toggle"
      title={props.title}
      onClick={() => void props.onClick()}
    >
      toggle
    </button>
  ),
}));

import {
  QuickActionRowActions,
  QuickActionRowHandle,
  QuickActionRowShell,
  QuickActionRowSummary,
} from './sections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createAction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'action-1',
    name: 'Visible capture',
    icon: 'Camera',
    origin: 'user',
    bundledId: null,
    status: true,
    screenshotMode: 'visible',
    emulation: 'desktop-1440',
    delay: 5,
    imageFormat: 'png',
    afterCapture: 'download_default',
    ...overrides,
  };
}

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  formatHotkeyMock.mockReset();
  formatHotkeyMock.mockReturnValue('Ctrl+Shift+K');
  getQuickActionDisplayNameMock.mockReset();
  getQuickActionDisplayNameMock.mockImplementation((action: { name: string }) => action.name);
  isBundledQuickActionMock.mockReset();
  isBundledQuickActionMock.mockReturnValue(false);
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

async function verifyRowShellOwnership() {
  const onDragLeave = vi.fn();
  const onDragOver = vi.fn();
  const onDrop = vi.fn();
  const onHoverChange = vi.fn();

  await renderNode(
    <QuickActionRowShell
      actionId="action-1"
      className="row-shell"
      onDragLeave={onDragLeave as never}
      onDragOver={onDragOver as never}
      onDrop={onDrop as never}
      onHoverChange={onHoverChange}
    >
      <span>content</span>
    </QuickActionRowShell>
  );

  const shell = container?.querySelector('.row-shell');
  const dragEvent = new Event('dragover', { bubbles: true, cancelable: true });
  const dropEvent = new Event('drop', { bubbles: true, cancelable: true });

  act(() => {
    shell?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    shell?.dispatchEvent(dragEvent);
    shell?.dispatchEvent(new Event('dragleave', { bubbles: true }));
    shell?.dispatchEvent(dropEvent);
    shell?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  });

  expect(onHoverChange).toHaveBeenNthCalledWith(1, 'action-1');
  expect(onHoverChange).toHaveBeenNthCalledWith(2, null);
  expect(onDragOver).toHaveBeenCalledWith(expect.anything(), 'action-1');
  expect(onDragLeave).toHaveBeenCalled();
  expect(onDrop).toHaveBeenCalledWith(expect.anything(), 'action-1');
}

async function verifyUserActionMetaAndControls() {
  const action = createAction();
  const hotkey = {
    altKey: false,
    ctrlKey: true,
    key: 'K',
    metaKey: false,
    shiftKey: true,
  };
  const onDeleteConfirm = vi.fn();
  const onEdit = vi.fn();
  const onToggleStatus = vi.fn(async () => undefined);

  await renderNode(
    <>
      <QuickActionRowSummary
        action={action as never}
        viewportPresets={[{ id: 'desktop-1440', label: 'Desktop', width: 1440, height: 900 }]}
      />
      <QuickActionRowActions
        action={action as never}
        hotkey={hotkey}
        isHovered
        onDeleteConfirm={onDeleteConfirm}
        onEdit={onEdit}
        onToggleStatus={onToggleStatus}
      />
    </>
  );

  expect(container?.textContent).toContain('Visible capture');
  expect(container?.textContent).toContain('settings.quickActions.screenshotModeVisible');
  expect(container?.textContent).toContain('Desktop (1440×900)');
  expect(container?.textContent).toContain('5 settings.quickActions.delayShortSuffix');
  expect(container?.textContent).toContain('PNG');
  expect(container?.textContent).toContain('settings.quickActions.afterCaptureDownloadDefault');
  expect(container?.textContent).toContain('Ctrl+Shift+K');

  const buttons = container?.querySelectorAll<HTMLButtonElement>('button') ?? [];
  act(() => {
    buttons.forEach((button) => button.click());
  });

  expect(onToggleStatus).toHaveBeenCalledTimes(1);
  expect(onEdit).toHaveBeenCalledTimes(1);
  expect(onDeleteConfirm).toHaveBeenCalledTimes(1);
}

async function verifyBundledActionAffordances() {
  isBundledQuickActionMock.mockReturnValue(true);
  const onDragEnd = vi.fn();
  const onDragStart = vi.fn();

  await renderNode(
    <>
      <QuickActionRowHandle
        actionId="action-1"
        onDragEnd={onDragEnd as never}
        onDragStart={onDragStart as never}
      />
      <QuickActionRowSummary
        action={createAction({ origin: 'bundled', bundledId: 'default-fullscreen' }) as never}
        viewportPresets={undefined}
      />
      <QuickActionRowActions
        action={createAction({ origin: 'bundled', bundledId: 'default-fullscreen' }) as never}
        isHovered={false}
        onDeleteConfirm={vi.fn()}
        onEdit={vi.fn()}
        onToggleStatus={vi.fn(async () => undefined)}
      />
    </>
  );

  const handle = container?.querySelector('[draggable="true"]');

  act(() => {
    handle?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    handle?.dispatchEvent(new Event('dragend', { bubbles: true }));
  });

  expect(onDragStart).toHaveBeenCalledWith(expect.anything(), 'action-1');
  expect(onDragEnd).toHaveBeenCalled();
  expect(container?.textContent).toContain('settings.quickActions.bundledBadge');
  expect(container?.querySelector('button.info-button')).toBeNull();
  expect(container?.querySelector('button.danger-button')).toBeNull();
}

describe('quick-actions list-row sections', () => {
  it('routes shell hover and drag-drop ownership through the row shell', verifyRowShellOwnership);
  it('renders user action meta and controls', verifyUserActionMetaAndControls);
  it('renders bundled action affordances', verifyBundledActionAffordances);
});
