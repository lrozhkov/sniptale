// @vitest-environment jsdom

import React from 'react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createToolsPanelProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

const presetHeaderMock = vi.fn();

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: vi.fn((key: string) => key),
}));

vi.mock('../presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../presets')>()),
  EditorInspectorPresetHeader: (props: React.PropsWithChildren<{ state: unknown }>) => {
    presetHeaderMock(props);
    return <div data-testid="preset-header">{props.children}</div>;
  },
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
  label?: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div aria-label={props.label} role="group">
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
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function updateNumericInput(label: string, value: number) {
  const numericButton = container?.querySelector<HTMLButtonElement>(
    `[data-testid="numeric-${label}"]`
  );
  if (numericButton) {
    numericButton.click();
    return;
  }
  const input = container?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
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

function createProps(fillMode: 'none' | 'color' | 'gradient' | 'rough' = 'none') {
  const props = createToolsPanelProps();
  props.inspectorToolSettings.line = {
    ...props.inspectorToolSettings.line,
    fillMode,
    opacity: 0.42,
  };
  props.toolPresetHeader = { value: 'line-preset' } as never;
  return props;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  presetHeaderMock.mockClear();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('wires line stroke, width, style, corners, roughness, and opacity controls', () => {
  const props = createProps();
  render(<>{renderLineControlsSection(props as never)}</>);

  act(() => {
    const buttons = Array.from(container?.querySelectorAll('button') ?? []);
    buttons.find((button) => button.textContent === 'editor.compact.lineColor-apply')?.click();
    buttons.find((button) => button.textContent === 'Dash')?.click();
    buttons.find((button) => button.textContent === 'Sharp')?.click();
    updateNumericInput('editor.compact.width', 7);
    updateNumericInput('editor.compact.roughness', 7);
    updateNumericInput('editor.compact.bowing', 7);
    updateNumericInput('editor.compact.opacity', 7);
  });

  expect(container?.querySelector('[data-testid="preset-header"]')).not.toBeNull();
  expect(props.updateColor).toHaveBeenCalled();
  expect(props.applyLinePatch).toHaveBeenCalledWith({ color: '#def' });
  expect(props.applyLinePatch).toHaveBeenCalledWith({ style: 'dash' });
  expect(props.applyLinePatch).toHaveBeenCalledWith({ corners: 'sharp' });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ width: 7 });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ roughness: 7 });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ bowing: 7 });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ opacity: 0.07 });
  expect(props.commitPendingSelectionSettings).toHaveBeenCalledTimes(4);
  expect(presetHeaderMock).toHaveBeenCalledWith(
    expect.objectContaining({ state: { value: 'line-preset' } })
  );
});

it('renders fill mode specific controls and patches fill settings', () => {
  const props = createProps('gradient');
  render(<>{renderLineControlsSection(props as never)}</>);
  expect(container?.querySelector('[data-testid="range-editor.compact.gradientAngle"]')).toBeNull();

  act(() => {
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'editor.compact.lineFill')
      ?.click();
  });
  expect(container?.querySelector('[aria-label="editor.compact.lineFill"]')).not.toBeNull();
  act(() => {
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'Color')
      ?.click();
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'editor.gradient.color-apply')
      ?.click();
    updateNumericInput('editor.gradient.angle', 7);
    updateNumericInput('editor.compact.fillOpacity', 7);
  });

  expect(props.applyLinePatch).toHaveBeenCalledWith({ fillMode: 'color' });
  expect(props.applyLinePatch).toHaveBeenCalledWith(
    expect.objectContaining({ gradientFrom: '#def' })
  );
  expect(props.previewLinePatch).toHaveBeenCalledWith({ gradientAngle: 7 });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ fillOpacity: 0.07 });
});

it('renders collapsed line shadow controls and patches shadow settings', () => {
  const props = createProps();
  props.inspectorToolSettings.line.shadow = 30;
  render(<>{renderLineControlsSection(props as never)}</>);
  expect(container?.querySelector('[data-testid="range-editor.compact.shadowSize"]')).toBeNull();

  act(() => {
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'highlighter.editor.shadowLabel')
      ?.click();
  });
  act(() => {
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'editor.compact.color-apply')
      ?.click();
    updateNumericInput('editor.compact.shadowSize', 7);
    updateNumericInput('editor.compact.shadowAngle', 7);
  });

  expect(props.applyLinePatch).toHaveBeenCalledWith({ shadowColor: '#def' });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ shadow: 7 });
  expect(props.previewLinePatch).toHaveBeenCalledWith({ shadowAngle: 7 });
});
