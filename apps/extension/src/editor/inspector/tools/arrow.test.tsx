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

vi.mock('../../../features/highlighter/style', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../features/highlighter/style')>();
  return {
    ...actual,
    formatBorderShadowIntensityValue: vi.fn((value: number) => `${value}/100`),
  };
});

vi.mock('../presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../presets')>()),
  EditorInspectorPresetHeader: (props: React.PropsWithChildren<{ state: unknown }>) => {
    presetHeaderMock(props);
    return <div data-testid="preset-header">preset-header{props.children}</div>;
  },
}));

function getMockArrowValue(label: string | undefined) {
  if (label === 'highlighter.editor.shadowLabel' || label === 'editor.compact.shadowSize')
    return 100;
  if (label === 'editor.compact.shadowAngle') return 270;
  return 7;
}

function MockRange(props: {
  'aria-label'?: string;
  max?: number;
  onChange: (event: { currentTarget: { value: string } }) => void;
  onValueCommit?: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`range-${props['aria-label'] ?? 'unknown'}`}
      data-max={props.max ?? ''}
      onClick={() => {
        props.onChange({
          currentTarget: { value: String(getMockArrowValue(props['aria-label'])) },
        });
        props.onValueCommit?.();
      }}
    />
  );
}

function MockNumericRow(props: {
  label?: string;
  max?: number;
  onCommitValue?: (value: number) => void;
  onPreviewValue?: (value: number) => void;
}) {
  return (
    <button
      type="button"
      data-testid={`numeric-${props.label ?? 'unknown'}`}
      data-max={props.max ?? ''}
      onClick={() => {
        const value = getMockArrowValue(props.label);
        props.onPreviewValue?.(value);
        props.onCommitValue?.(value);
      }}
    />
  );
}

function MockSelect(props: {
  label?: string;
  ariaLabel?: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div aria-label={props.label ?? props.ariaLabel} role="group">
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
    <div>
      <button type="button" onClick={() => props.onChange('#def')}>
        {props.title}-apply
      </button>
    </div>
  );
}

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  CompactRange: MockRange,
  NumericRow: MockNumericRow,
  SelectField: MockSelect,
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
  EditorColorControl: MockColorControl,
  ColorField: MockColorControl,
}));

vi.mock('./arrow-head-grid', () => ({
  ArrowHeadPreviewGrid: (props: {
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
          aria-label={option.label}
          aria-pressed={option.value === props.value}
          data-preview-option={option.value}
          onClick={() => props.onChange(option.value)}
        >
          <svg aria-hidden="true" data-preview={option.value} />
        </button>
      ))}
    </div>
  ),
  renderArrowHeadPreview: (value: string) => <svg aria-hidden="true" data-preview={value} />,
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

import { renderArrowControlsSection } from './arrow';

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

function createProps() {
  const props = createToolsPanelProps({
    arrowTypeOptions: [
      { label: 'Sharp', value: 'sharp' },
      { label: 'Curved', value: 'curved' },
      { label: 'Elbow', value: 'elbow' },
    ],
    arrowHeadOptions: [
      { label: 'None', value: 'none' },
      { label: 'Triangle', value: 'triangle' },
      { label: 'Open', value: 'open' },
      { label: 'Block', value: 'block' },
    ],
  });
  props.inspectorToolSettings.arrow.shadow = 30;
  props.inspectorToolSettings.arrow.variant = 'standard';
  props.inspectorToolSettings.arrow.dynamicWidth = false;
  props.toolPresetHeader = { value: 'arrow-preset' } as never;
  return props;
}

it('wires arrow color apply and width changes into arrow patches', () => {
  const props = createProps();
  render(<>{renderArrowControlsSection(props as never)}</>);
  expect(container?.querySelector('[data-testid="preset-header"]')).not.toBeNull();
  act(() => {
    const colorButton = Array.from(container?.querySelectorAll('button') ?? []).find(
      (button) => button.textContent === 'editor.compact.arrowColor-apply'
    );
    colorButton?.click();
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'Curved')
      ?.click();
    updateNumericInput('editor.compact.width', 7);
  });

  expect(props.updateColor).toHaveBeenCalled();
  expect(props.applyArrowPatch).toHaveBeenCalledWith({ color: '#def' });
  expect(props.applyArrowPatch).toHaveBeenCalledWith({ arrowType: 'curved', mode: 'curve' });
  expect(container?.querySelector('[data-testid="numeric-editor.compact.width"]')).not.toBeNull();
  expect(props.previewArrowPatch).toHaveBeenCalledWith({ width: 7 });
  expect(props.commitPendingSelectionSettings).toHaveBeenCalledOnce();
  expect(
    container
      ?.querySelector('[data-testid="numeric-editor.compact.width"]')
      ?.getAttribute('data-max')
  ).toBe('36');
  expect(presetHeaderMock).toHaveBeenCalledWith(
    expect.objectContaining({
      state: { value: 'arrow-preset' },
    })
  );
});

it('skips preset-header rendering when the arrow controls do not receive one', () => {
  const props = createProps();
  props.toolPresetHeader = null;
  render(<>{renderArrowControlsSection(props as never)}</>);
  expect(container?.querySelector('[data-testid="preset-header"]')).toBeNull();
  expect(presetHeaderMock).not.toHaveBeenCalled();
});
