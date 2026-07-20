// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../environment/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../environment/shared')>()),
  PanelSection: (props: Record<string, unknown> & { children?: React.ReactNode }) => (
    <section>
      <div>{String(props['label'])}</div>
      <div>{String(props['value'] ?? '')}</div>
      {props.children}
    </section>
  ),
}));

vi.mock('../../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../chrome/ui')>()),
  ColorField: (props: Record<string, unknown>) => (
    <button
      type="button"
      onClick={() => {
        (props['onChange'] as (value: string) => void)?.('#defdef');
      }}
    >
      {String(props['label'])} color
    </button>
  ),
  NumericRow: (props: Record<string, unknown>) => (
    <label>
      {String(props['label'])}
      <input
        data-testid="grid-size-range"
        value={String(props['value'] ?? '')}
        onChange={(event) =>
          (props['onPreviewValue'] as (value: number) => void)?.(Number(event.currentTarget.value))
        }
        readOnly={false}
      />
    </label>
  ),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { EditorInspectorGridStyleSections } from './style-sections';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

function createGridStyleSection(args: {
  applyGridColor: (color: string) => void;
  clampGridSize: (value: number) => number;
  updateWorkspace: (patch: { gridColor?: string; gridSize?: number }) => void;
}) {
  return EditorInspectorGridStyleSections({
    applyGridColor: args.applyGridColor,
    clampGridSize: args.clampGridSize,
    gridColor: '#cccccc',
    gridPalette: ['#cccccc', '#dedede'],
    gridSize: 24,
    gridSizeMax: 96,
    gridSizeMin: 8,
    recentColors: ['#aaaaaa'],
    updateWorkspace: args.updateWorkspace,
  });
}

function renderGridStyleSection(args: {
  applyGridColor: (color: string) => void;
  clampGridSize: (value: number) => number;
  updateWorkspace: (patch: { gridColor?: string; gridSize?: number }) => void;
}) {
  act(() => {
    root?.render(
      <EditorInspectorGridStyleSections
        applyGridColor={args.applyGridColor}
        clampGridSize={args.clampGridSize}
        gridColor="#cccccc"
        gridPalette={['#cccccc', '#dedede']}
        gridSize={24}
        gridSizeMax={96}
        gridSizeMin={8}
        recentColors={['#aaaaaa']}
        updateWorkspace={args.updateWorkspace}
      />
    );
  });
}

function assertGridSectionLayout() {
  expect(container?.textContent).toContain('editor.compact.gridLines');
  expect(container?.textContent).toContain('editor.compact.dimension');
  const sectionLabels = Array.from(
    container?.querySelectorAll('section > div:first-child') ?? []
  ).map((item) => item.textContent);
  expect(sectionLabels.slice(0, 1)).toEqual(['editor.compact.neutralPresets']);
  expect(container?.querySelector('[data-testid="grid-size-input"]')).toBeNull();
}

it('wires size and color controls through workspace updates', () => {
  const clampGridSize = vi.fn((value: number) => Math.max(8, Math.min(96, value)));
  const applyGridColor = vi.fn((_: string) => undefined);
  const updateWorkspace = vi.fn((_: { gridColor?: string; gridSize?: number }) => undefined);
  const element = createGridStyleSection({ applyGridColor, clampGridSize, updateWorkspace });
  renderGridStyleSection({ applyGridColor, clampGridSize, updateWorkspace });

  const colorSection = (
    element.props.children as React.ReactElement[]
  )[0] as React.ReactElement<any>;
  colorSection.props.onPreviewChange('#ababab');
  colorSection.props.onPreviewReset('#cdcdcd');

  const rangeInput = container?.querySelector(
    '[data-testid="grid-size-range"]'
  ) as HTMLInputElement;

  act(() => {
    container
      ?.querySelector('button[title="#dedede"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    setInputValue(rangeInput, '42');
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent?.includes('color'))
      ?.click();
  });

  expect(clampGridSize).toHaveBeenCalledWith(42);
  expect(applyGridColor).toHaveBeenCalledWith('#dedede');
  expect(applyGridColor).toHaveBeenCalledWith('#defdef');
  expect(updateWorkspace).toHaveBeenCalledWith({ gridColor: '#ababab' });
  expect(updateWorkspace).toHaveBeenCalledWith({ gridColor: '#cdcdcd' });
  expect(updateWorkspace).toHaveBeenCalledWith({ gridSize: 42 });
  assertGridSectionLayout();
});
