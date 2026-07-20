// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createToolsPanelProps } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: vi.fn((key: string) => key),
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
        props.onChange({ currentTarget: { value: '1.5' } });
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
        props.onPreviewValue?.(1.5);
        props.onCommitValue?.(1.5);
      }}
    />
  );
}

function MockSelect(props: {
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div>
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

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  CompactRange: MockRange,
  NumericRow: MockNumericRow,
  CompactSelect: MockSelect,
  SelectField: MockSelect,
  EditorColorControl: () => null,
}));

vi.mock('../presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../presets')>()),
  EditorInspectorPresetHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./arrow-head-grid', () => ({
  ArrowHeadPreviewGrid: () => null,
  renderArrowHeadPreview: () => null,
}));
vi.mock('./sections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sections')>()),
  PanelSection: ({ children, label }: { children: ReactNode; label: string }) => (
    <section data-label={label}>{children}</section>
  ),
}));
vi.mock('./segmented-row', () => ({ SegmentedRow: () => null }));

import { renderArrowControlsSection } from './arrow';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

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

it('wires arrow style, roughness, and bowing controls', () => {
  const props = createToolsPanelProps();
  props.inspectorToolSettings.arrow = {
    ...props.inspectorToolSettings.arrow,
    bowing: undefined,
    roughness: undefined,
    style: undefined,
  } as never;

  act(() => root?.render(<>{renderArrowControlsSection(props as never)}</>));
  act(() => {
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'Dash')
      ?.click();
    updateNumericInput('editor.compact.roughness', 1.5);
    updateNumericInput('editor.compact.bowing', 1.5);
  });

  expect(props.applyArrowPatch).toHaveBeenCalledWith({ style: 'dash' });
  expect(props.previewArrowPatch).toHaveBeenCalledWith({ roughness: 1.5 });
  expect(props.previewArrowPatch).toHaveBeenCalledWith({ bowing: 1.5 });
  expect(props.commitPendingSelectionSettings).toHaveBeenCalledTimes(2);
});
