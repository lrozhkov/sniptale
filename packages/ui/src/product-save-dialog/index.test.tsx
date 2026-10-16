// @vitest-environment jsdom

import { act, useState } from 'react';
import { CommandPressScope } from '../control-language/press';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductSaveDialog, type ProductSaveDialogProps } from '@sniptale/ui/product-save-dialog';

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function createDialogProps(
  overrides: Partial<ProductSaveDialogProps> = {}
): ProductSaveDialogProps {
  return {
    title: 'Save capture',
    subtitle: 'Choose a destination',
    closeLabel: 'Close dialog',
    filenameLabel: 'Filename',
    filename: 'capture.png',
    filenamePlaceholder: 'capture.png',
    onFilenameChange: () => undefined,
    presetLabel: 'Presets',
    presetCount: '1',
    presetItems: [
      {
        id: 'preset-1',
        title: 'Downloads',
        path: '/home/demo/Downloads',
      },
    ],
    presetsEmptyState: 'No presets available',
    systemFolderLabel: 'Choose folder',
    systemFolderHint: 'Use the browser picker',
    onChoosePreset: () => undefined,
    onChooseSystemFolder: () => undefined,
    onClose: () => undefined,
    footer: <button type="button">Save now</button>,
    ...overrides,
  };
}

function renderDialog(props: ProductSaveDialogProps) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ProductSaveDialog {...props} />);
  });
}

function changeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  if (!valueSetter) {
    throw new Error('Expected native HTMLInputElement value setter');
  }

  act(() => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function clickDialogActions() {
  const presetButton = container?.querySelector<HTMLButtonElement>('.sniptale-save-dialog-item');
  const systemFolderButton = container?.querySelector<HTMLButtonElement>(
    '.sniptale-save-dialog-system'
  );
  const closeButton = container?.querySelector<HTMLButtonElement>('.sniptale-modal-close');
  const backdrop = container?.querySelector<HTMLDivElement>('.sniptale-modal-backdrop');

  act(() => {
    presetButton?.click();
    systemFolderButton?.click();
    closeButton?.click();
    backdrop?.click();
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProductSaveDialog', () => {
  it('renders populated presets and wires dialog actions', () => {
    const onFilenameChange = vi.fn();
    const onChoosePreset = vi.fn();
    const onChooseSystemFolder = vi.fn();
    const onClose = vi.fn();

    renderDialog(
      createDialogProps({
        onFilenameChange,
        onChoosePreset,
        onChooseSystemFolder,
        onClose,
      })
    );

    const input = container?.querySelector<HTMLInputElement>('#save-dialog-filename');
    const sections = container?.querySelectorAll('.sniptale-save-dialog-section');
    expect(container?.querySelector('.sniptale-save-dialog-footer')?.textContent).toContain(
      'Save now'
    );
    expect(container?.textContent).toContain('Downloads');
    expect(container?.textContent).toContain('/home/demo/Downloads');
    expect(input?.value).toBe('capture.png');
    expect(sections).toHaveLength(2);
    expect(container?.querySelector('.sniptale-save-dialog-icon-badge')).not.toBeNull();
    expect(container?.querySelector('.sniptale-glass-section')).toBeNull();
    expect(container?.querySelector('.sniptale-ai-icon-badge')).toBeNull();
    expect(container?.querySelector('.sniptale-toolbar-menu-item-copy')).toBeNull();

    if (!input) {
      throw new Error('Expected save dialog filename input');
    }

    changeInputValue(input, 'updated.png');
    clickDialogActions();

    expect(onFilenameChange).toHaveBeenCalledWith('updated.png');
    expect(onChoosePreset).toHaveBeenCalledWith('preset-1', expect.any(Object));
    expect(onChooseSystemFolder).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders the empty preset state and omits the footer when it is absent', () => {
    renderDialog(
      createDialogProps({
        presetCount: '0',
        presetItems: [],
        footer: undefined,
      })
    );

    expect(container?.textContent).toContain('No presets available');
    expect(container?.querySelector('.sniptale-save-dialog-item')).toBeNull();
    expect(container?.querySelector('.sniptale-save-dialog-footer')).toBeNull();
    expect(container?.querySelector('.sniptale-save-dialog-section-label')?.textContent).toBe(
      'Presets'
    );
  });

  it('omits the filename placeholder when it is not provided', () => {
    const baseProps = createDialogProps();
    const { filenamePlaceholder: _filenamePlaceholder, ...props } = baseProps;

    renderDialog(props);

    expect(container?.querySelector<HTMLInputElement>('#save-dialog-filename')?.placeholder).toBe(
      ''
    );
  });

  it('disables filename and destination actions while a save is pending', () => {
    renderDialog(createDialogProps({ disabled: true }));

    expect(container?.querySelector<HTMLInputElement>('#save-dialog-filename')?.disabled).toBe(
      true
    );
    expect(
      container?.querySelector<HTMLButtonElement>('.sniptale-save-dialog-item')?.disabled
    ).toBe(true);
    expect(
      container?.querySelector<HTMLButtonElement>('.sniptale-save-dialog-system')?.disabled
    ).toBe(true);
  });
  it('clears the controlled draft, restores field focus, and hides Clear for empty or disabled values', () => {
    function ControlledDialog({ disabled = false }: { disabled?: boolean }) {
      const [filename, setFilename] = useState('capture.png');
      return (
        <CommandPressScope value={true}>
          <ProductSaveDialog
            {...createDialogProps({
              filename,
              disabled,
              filenameClearLabel: 'Clear Filename',
              onFilenameChange: setFilename,
            })}
          />
        </CommandPressScope>
      );
    }
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(<ControlledDialog />));
    const input = container.querySelector<HTMLInputElement>('#save-dialog-filename')!;
    expect(input.labels?.[0]?.textContent).toBe('Filename');
    const clear = container.querySelector<HTMLButtonElement>('.sniptale-save-dialog-clear')!;
    expect(clear.getAttribute('aria-label')).toBe('Clear Filename');
    act(() => clear.click());
    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(container.querySelector('.sniptale-save-dialog-clear')).toBeNull();
    changeInputValue(input, 'replacement.png');
    expect(container.querySelector('.sniptale-save-dialog-clear')).not.toBeNull();
    act(() => root?.render(<ControlledDialog disabled />));
    expect(input.value).toBe('replacement.png');
    expect(container.querySelector('.sniptale-save-dialog-clear')).toBeNull();
  });

  it('keeps adopted commands on native release and forwards the original native click', () => {
    const onChoosePreset = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        <CommandPressScope value={true}>
          <ProductSaveDialog {...createDialogProps({ onChoosePreset })} />
        </CommandPressScope>
      )
    );
    const preset = container.querySelector<HTMLButtonElement>('.sniptale-save-dialog-item')!;
    act(() => preset.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
    expect(onChoosePreset).not.toHaveBeenCalled();
    act(() => preset.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })));
    const click = new MouseEvent('click', { bubbles: true, button: 0, detail: 1 });
    act(() => preset.dispatchEvent(click));
    expect(onChoosePreset).toHaveBeenCalledTimes(1);
    expect(onChoosePreset.mock.calls[0]?.[1].nativeEvent).toBe(click);
  });
});
