// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { SavePreset } from '../../../../contracts/settings';
import { SavePresetEditorModal } from '.';

const { loggerErrorMock, productActionButtonPropsSpy } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  productActionButtonPropsSpy: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: ({
    children,
    tone: _tone,
    compact,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    compact?: boolean;
    tone?: string;
  }) => {
    productActionButtonPropsSpy({ compact, ...props });
    return <button {...props}>{children}</button>;
  },
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModal: ({
    children,
    isOpen,
    compact: _compact,
    maxHeight: _maxHeight,
    scrollable: _scrollable,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & {
    compact?: boolean;
    isOpen?: boolean;
    maxHeight?: string;
    scrollable?: boolean;
  }) => (isOpen ? <div {...props}>{children}</div> : null),
  ProductModalBody: ({
    children,
    compact: _compact,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { compact?: boolean }) => (
    <div {...props}>{children}</div>
  ),
  ProductModalFooter: ({
    children,
    compact: _compact,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { compact?: boolean }) => (
    <div {...props}>{children}</div>
  ),
  ProductModalHeader: ({ onClose, title }: { title: string; onClose?: () => void }) => (
    <header>
      <span>{title}</span>
      <button type="button" onClick={onClose}>
        close
      </button>
    </header>
  ),
}));

vi.mock('../../../section-surface/panel-controls', () => ({
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
  SettingsSwitch: (props: React.ButtonHTMLAttributes<HTMLButtonElement> & { checked: boolean }) => (
    <button type="button" aria-pressed={props.checked} onClick={props.onClick}>
      toggle
    </button>
  ),
}));

vi.mock('../../../section-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../section-surface')>()),
  settingsToggleRowClassName: 'toggle-row',
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

type ModalProps = React.ComponentProps<typeof SavePresetEditorModal>;

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function renderModal(props: ModalProps) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<SavePresetEditorModal {...props} />);
  });
}

function createPreset(overrides: Partial<SavePreset> = {}): SavePreset {
  return {
    id: overrides.id ?? 'preset-1',
    name: overrides.name ?? 'Images',
    path: overrides.path ?? 'captures',
    enabled: overrides.enabled ?? true,
    order: overrides.order ?? 0,
  };
}

beforeEach(() => {
  loggerErrorMock.mockReset();
  productActionButtonPropsSpy.mockReset();
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

async function submitModalForm() {
  const form = container?.querySelector('form') as HTMLFormElement;

  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

it('submits trimmed and sanitized values, then closes the modal', async () => {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);

  await renderModal({ onClose, onSave });

  const inputs = container?.querySelectorAll('input[type="text"]') ?? [];
  const nameInput = inputs[0] as HTMLInputElement;
  const pathInput = inputs[1] as HTMLInputElement;
  const toggleButton = container?.querySelector('button[aria-pressed]') as HTMLButtonElement;

  await act(async () => {
    setInputValue(nameInput, '  Screens  ');
    setInputValue(pathInput, 'reports//daily:../shots');
    toggleButton.click();
  });

  await submitModalForm();

  expect(onSave).toHaveBeenCalledWith('Screens', 'reports/daily-shots', false);
  expect(onClose).toHaveBeenCalledOnce();
});

it('updates its local state when the edited preset changes', async () => {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);

  await renderModal({
    onClose,
    onSave,
    preset: createPreset({ name: 'Images', path: 'images', enabled: true }),
  });
  await renderModal({
    onClose,
    onSave,
    preset: createPreset({
      id: 'preset-2',
      name: 'Exports',
      path: 'exports/final',
      enabled: false,
    }),
  });

  const inputs = container?.querySelectorAll('input[type="text"]') ?? [];
  expect((inputs[0] as HTMLInputElement).value).toBe('Exports');
  expect((inputs[1] as HTMLInputElement).value).toBe('exports/final');
  expect(
    (container?.querySelector('button[aria-pressed]') as HTMLButtonElement).getAttribute(
      'aria-pressed'
    )
  ).toBe('false');
});

it('logs save failures and keeps the modal open', async () => {
  const onClose = vi.fn();
  const onSave = vi.fn().mockRejectedValue(new Error('save failed'));

  await renderModal({
    onClose,
    onSave,
    preset: createPreset(),
  });

  await submitModalForm();

  expect(loggerErrorMock).toHaveBeenCalledWith('Save preset failed', expect.any(Error));
  expect(onClose).not.toHaveBeenCalled();
});

it('renders create-mode actions without passing a preset into the footer branch', async () => {
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);

  await renderModal({ onClose, onSave });

  expect(container?.textContent).toContain('savePresets.editor.newTitle');
  expect(container?.textContent).toContain('common.actions.add');
  expect(productActionButtonPropsSpy).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ compact: undefined, type: 'submit' })
  );
});
