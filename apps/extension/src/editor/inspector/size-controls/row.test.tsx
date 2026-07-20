// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SizeControlsRow } from './row';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderRow(props?: Partial<ComponentProps<typeof SizeControlsRow>>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  const rowProps: ComponentProps<typeof SizeControlsRow> = {
    height: 720,
    locked: true,
    onHeightChange: vi.fn(),
    onToggleLock: vi.fn(),
    onWidthChange: vi.fn(),
    width: 1280,
    ...props,
  };

  act(() => {
    root?.render(
      <SizeControlsRow
        {...rowProps}
        dataUi="editor.size-controls.row"
        widthInputDataUi="editor.size-controls.row.width"
        heightInputDataUi="editor.size-controls.row.height"
      />
    );
  });

  return rowProps;
}

function queryInput(dataUi: string) {
  return container?.querySelector(`[data-ui="${dataUi}"]`) as HTMLInputElement | null;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

beforeEach(() => {
  vi.clearAllMocks();
});

function registerOrderTest() {
  it('keeps the canonical width-lock-height order', () => {
    renderRow();

    const row = container?.querySelector('[data-ui="editor.size-controls.row"]');
    const rowChildren = Array.from(row?.children ?? []);

    expect(rowChildren).toHaveLength(3);
    expect(rowChildren[0]?.querySelector('[aria-label="editor.compact.widthDimension"]')).not.toBe(
      null
    );
    expect(rowChildren[1]?.getAttribute('title')).toBe('editor.compact.keepAspectRatio');
    expect(
      rowChildren[2]?.querySelector('[aria-label="editor.compact.heightDimension"]')
    ).not.toBeNull();
  });
}

function registerCommitAndResetTest() {
  it('commits sanitized values on blur or Enter and resets drafts on Escape', () => {
    const onWidthChange = vi.fn();
    const onHeightChange = vi.fn();

    renderRow({ onHeightChange, onWidthChange });

    act(() => {
      queryInput('editor.size-controls.row.width')?.focus();
    });
    act(() => {
      setInputValue(queryInput('editor.size-controls.row.width')!, '0020abc');
    });
    act(() => {
      queryInput('editor.size-controls.row.height')?.focus();
    });
    act(() => {
      setInputValue(queryInput('editor.size-controls.row.height')!, '0');
    });
    act(() => {
      queryInput('editor.size-controls.row.height')!.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
      );
    });
    act(() => {
      setInputValue(queryInput('editor.size-controls.row.height')!, '777');
    });
    act(() => {
      queryInput('editor.size-controls.row.height')!.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
      );
    });

    expect(onWidthChange).toHaveBeenCalledWith(20);
    expect(onHeightChange).toHaveBeenCalledWith(1);
    expect(queryInput('editor.size-controls.row.height')?.value).toBe('720');
  });
}

function registerToggleTest() {
  it('routes aspect-toggle clicks through the shared row', () => {
    const onToggleLock = vi.fn();

    renderRow({ onToggleLock });

    act(() => {
      (
        container?.querySelector(
          'button[title="editor.compact.keepAspectRatio"]'
        ) as HTMLButtonElement | null
      )?.click();
    });

    expect(onToggleLock).toHaveBeenCalledOnce();
  });
}

function registerDraftStateEdgeTest() {
  it('resets empty drafts and resyncs when external dimensions change', () => {
    const onWidthChange = vi.fn();

    renderRow({ onWidthChange, width: 1280 });

    act(() => {
      setInputValue(queryInput('editor.size-controls.row.width')!, '');
    });
    act(() => {
      queryInput('editor.size-controls.row.width')!.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
      );
    });

    expect(onWidthChange).not.toHaveBeenCalled();
    expect(queryInput('editor.size-controls.row.width')?.value).toBe('1280');

    act(() => {
      root?.render(
        <SizeControlsRow
          height={720}
          locked
          onHeightChange={vi.fn()}
          onToggleLock={vi.fn()}
          onWidthChange={onWidthChange}
          width={1440}
          dataUi="editor.size-controls.row"
          widthInputDataUi="editor.size-controls.row.width"
          heightInputDataUi="editor.size-controls.row.height"
        />
      );
    });

    expect(queryInput('editor.size-controls.row.width')?.value).toBe('1440');
  });
}

function registerSizeControlsRowTests() {
  registerOrderTest();
  registerCommitAndResetTest();
  registerToggleTest();
  registerDraftStateEdgeTest();
}

describe('SizeControlsRow', registerSizeControlsRowTests);
