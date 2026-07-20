// @vitest-environment jsdom

import React from 'react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createToolsPanelProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: vi.fn((key: string) => key),
}));

vi.mock('../presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../presets')>()),
  EditorInspectorPresetHeader: (props: React.PropsWithChildren) => (
    <div data-testid="preset-header">{props.children}</div>
  ),
}));

function MockRange(props: {
  'aria-label'?: string;
  onChange: (event: { currentTarget: { value: string } }) => void;
  onValueCommit?: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`range-${props['aria-label'] ?? 'unknown'}`}
      onClick={() => {
        props.onChange({ currentTarget: { value: '7' } });
        props.onValueCommit?.();
      }}
    />
  );
}

function MockNumericRow(props: {
  label?: string;
  onCommitValue?: (value: number) => void;
  onPreviewValue?: (value: number) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`numeric-${props.label ?? 'unknown'}`}
      onClick={() => {
        props.onPreviewValue?.(7);
        props.onCommitValue?.(7);
      }}
    />
  );
}

function MockSelect(props: {
  'aria-label'?: string;
  label?: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div aria-label={props.label ?? props['aria-label']} role="group">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === props.value}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MockColorControl(props: { title: string; onChange: (value: string) => void }) {
  return (
    <button type="button" onClick={() => props.onChange('#def')}>
      {props.title}-apply
    </button>
  );
}

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  CompactRange: MockRange,
  NumericRow: MockNumericRow,
  CompactSelect: MockSelect,
  SelectField: MockSelect,
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
  EditorColorControl: MockColorControl,
  ColorField: MockColorControl,
}));

vi.mock('./sections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sections')>()),
  CollapsibleSection: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  PanelSection: ({
    children,
    label,
    value,
  }: {
    children: ReactNode;
    label: string;
    value?: ReactNode;
  }) => (
    <section data-label={label} data-value={value === undefined ? '' : String(value)}>
      {children}
    </section>
  ),
}));

vi.mock('./segmented-row', () => ({
  SegmentedRow: (props: {
    ariaLabel: string;
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) => (
    <div aria-label={props.ariaLabel} role="group">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === props.value}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

import { renderLineControlsSection } from './line';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

function clickButton(text: string) {
  Array.from(container?.querySelectorAll('button') ?? [])
    .find((button) => button.textContent === text)
    ?.click();
}

function updateNumericInput(label: string, value: number, fromEnd = false) {
  const numericButtons = Array.from(
    container?.querySelectorAll<HTMLButtonElement>(`[data-testid="numeric-${label}"]`) ?? []
  );
  const numericButton = fromEnd ? numericButtons.at(-1) : numericButtons[0];
  if (numericButton) {
    numericButton.click();
    return;
  }
  const inputs = Array.from(
    container?.querySelectorAll<HTMLInputElement>(`input[aria-label="${label}"]`) ?? []
  );
  const input = fromEnd ? inputs.at(-1) : inputs[0];
  if (!input) {
    throw new Error(`Expected numeric input ${label}`);
  }
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    String(value)
  );
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders rough fill controls when pencil fill is selected', () => {
  const props = createToolsPanelProps();
  props.inspectorToolSettings.line = {
    ...props.inspectorToolSettings.line,
    fillMode: 'rough',
  };
  delete props.inspectorToolSettings.line.bowing;
  render(<>{renderLineControlsSection(props as never)}</>);

  act(() => {
    clickButton('editor.compact.lineFill');
    clickButton('Dots');
    clickButton('editor.compact.fillColor-apply');
    updateNumericInput('editor.compact.lineWidth', 7, true);
    updateNumericInput('editor.compact.roughness', 7, true);
    updateNumericInput('editor.compact.bowing', 7, true);
    updateNumericInput('editor.compact.fillOpacity', 7);
    updateNumericInput('editor.compact.roughFillGap', 7);
    updateNumericInput('editor.compact.roughFillAngle', 7);
  });

  expect(props.applyLinePatch).toHaveBeenCalledWith({ roughFillStyle: 'dots' });
  expect(props.applyLinePatch).toHaveBeenCalledWith({ roughFillColor: '#def' });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ roughFillWeight: 7 });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ roughFillRoughness: 7 });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ roughFillBowing: 7 });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ roughFillOpacity: 0.07 });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ roughFillGap: 7 });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ roughFillAngle: 7 });
});
