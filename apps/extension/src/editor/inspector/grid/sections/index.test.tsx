// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../chrome/ui')>()),
  ColorField: (props: Record<string, unknown>) => (
    <button
      type="button"
      onClick={() => {
        (props['onChange'] as (value: string) => void)?.('#defdef');
      }}
    >
      color
    </button>
  ),
  NumericRow: (props: Record<string, unknown>) => (
    <input
      data-testid="grid-size-range"
      value={String(props['value'] ?? '')}
      onChange={(event) =>
        (props['onPreviewValue'] as (value: number) => void)?.(Number(event.currentTarget.value))
      }
      readOnly={false}
    />
  ),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

vi.mock('../../environment/shared', () => ({
  HeaderValueToggleSection: (
    props: Record<string, unknown> & {
      onChange?: (value: string) => void;
    }
  ) => (
    <section>
      <div>{String(props['label'])}</div>
      <button
        type="button"
        aria-label={String(props['ariaLabel'])}
        onClick={() => props.onChange?.(String(props['nextValue']))}
      >
        {String(props['value'])}
      </button>
    </section>
  ),
  PanelSection: (props: Record<string, unknown> & { children?: React.ReactNode }) => (
    <section>
      <div>{String(props['label'])}</div>
      <div>{String(props['value'] ?? '')}</div>
      {props.children}
    </section>
  ),
  panelButtonClassName: 'panel-button',
}));

import { GridPanelSections } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createGridProps() {
  return {
    applyGridColor: vi.fn(),
    clampGridSize: vi.fn((value: number) => Math.max(8, Math.min(96, value))),
    gridColor: '#cccccc',
    gridEnabled: true,
    gridPalette: ['#cccccc', '#dedede'],
    gridSize: 24,
    gridSizeMax: 96,
    gridSizeMin: 8,
    gridSnapEnabled: false,
    recentColors: ['#aaaaaa'],
    updateWorkspace: vi.fn(),
  };
}

function setupGridSectionsTest() {
  document.body.innerHTML = '';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
}

function renderGridSections(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

function findButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  ) as HTMLButtonElement | undefined;
}

function findButtonByAriaLabel(label: string) {
  return container?.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
}

function findPresetButton(color: string) {
  return container?.querySelector(`button[title="${color}"]`) as HTMLButtonElement | null;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('editor-inspector-grid sections', () => {
  beforeEach(setupGridSectionsTest);

  it('toggles grid and snap settings through workspace updates', () => {
    const props = createGridProps();

    renderGridSections(<GridPanelSections {...props} />);

    act(() => {
      findButtonByAriaLabel('editor.compact.hideGrid')?.click();
      findButtonByAriaLabel('editor.compact.enableSnap')?.click();
    });

    expect(props.updateWorkspace).toHaveBeenCalledWith({ gridEnabled: false });
    expect(props.updateWorkspace).toHaveBeenCalledWith({ gridSnapEnabled: true });
    expect(props.updateWorkspace).not.toHaveBeenCalledWith({ magnetEnabled: true });
    expect(container?.textContent).not.toContain('editor.compact.magnet');
  });

  it('renders style controls directly and wires preset, size, and color updates', () => {
    const props = createGridProps();

    renderGridSections(<GridPanelSections {...props} />);

    const rangeInput = container?.querySelector(
      '[data-testid="grid-size-range"]'
    ) as HTMLInputElement;

    act(() => {
      findPresetButton('#dedede')?.click();
      setInputValue(rangeInput, '42');
      findButton('color')?.click();
    });

    expect(props.clampGridSize).toHaveBeenCalledWith(42);
    expect(props.applyGridColor).toHaveBeenCalledWith('#dedede');
    expect(props.applyGridColor).toHaveBeenCalledWith('#defdef');
    expect(props.updateWorkspace).toHaveBeenCalledWith({ gridSize: 42 });
    expect(container?.querySelector('[data-testid="grid-size-input"]')).toBeNull();
  });
});
