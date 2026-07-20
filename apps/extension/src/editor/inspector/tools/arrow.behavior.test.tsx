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

vi.mock('../../../features/highlighter/style', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/highlighter/style')>()),
  formatBorderShadowIntensityValue: vi.fn((value: number) => `${value}/100`),
}));

vi.mock('../presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../presets')>()),
  EditorInspectorPresetHeader: (props: React.PropsWithChildren<{ state: unknown }>) => (
    <div data-testid="preset-header">{props.children}</div>
  ),
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  NumericRow: (props: {
    label?: string;
    max?: number;
    onCommitValue?: (value: number) => void;
    onPreviewValue?: (value: number) => void;
  }) => (
    <button
      type="button"
      data-testid={`numeric-${props.label ?? 'unknown'}`}
      data-max={props.max ?? ''}
      onClick={() => {
        const value = props.label === 'editor.compact.shadowAngle' ? 270 : 100;
        props.onPreviewValue?.(value);
        props.onCommitValue?.(value);
      }}
    />
  ),
  SelectField: (props: {
    label: string;
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) => (
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
  ),
  ColorField: (props: { title: string; onChange: (value: string) => void }) => (
    <button type="button" onClick={() => props.onChange('#def')}>
      {props.title}-apply
    </button>
  ),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
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
  PanelSection: (props: { children: ReactNode; label: string; value?: ReactNode }) => (
    <section data-label={props.label} data-value={String(props.value ?? '')}>
      {props.children}
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
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

function createProps() {
  const props = createToolsPanelProps({
    arrowHeadOptions: [
      { label: 'None', value: 'none' },
      { label: 'Triangle', value: 'triangle' },
      { label: 'Open', value: 'open' },
      { label: 'Block', value: 'block' },
    ],
    arrowTypeOptions: [
      { label: 'Sharp', value: 'sharp' },
      { label: 'Curved', value: 'curved' },
    ],
  });
  props.inspectorToolSettings.arrow.shadow = 30;
  props.inspectorToolSettings.arrow.dynamicWidth = false;
  return props;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders arrow type, dynamic width, and shadow controls into arrow patches', () => {
  const props = createProps();
  render(<>{renderArrowControlsSection(props as never)}</>);

  act(() => {
    const buttons = Array.from(container?.querySelectorAll('button') ?? []);
    buttons.find((button) => button.textContent === 'Curved')?.click();
    buttons.find((button) => button.textContent?.includes('editor.compact.disabledShort'))?.click();
    buttons.find((button) => button.textContent === 'highlighter.editor.shadowLabel')?.click();
  });
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-testid="numeric-editor.compact.shadowSize"]')
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>('[data-testid="numeric-editor.compact.shadowAngle"]')
      ?.click();
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'editor.compact.color-apply')
      ?.click();
  });

  expect(props.applyArrowPatch).toHaveBeenCalledWith({ arrowType: 'curved', mode: 'curve' });
  expect(props.applyArrowPatch).toHaveBeenCalledWith({ dynamicWidth: true });
  expect(props.previewArrowPatch).toHaveBeenCalledWith({ shadow: 100 });
  expect(props.previewArrowPatch).toHaveBeenCalledWith({ shadowAngle: 270 });
  expect(props.applyArrowPatch).toHaveBeenCalledWith({ shadowColor: '#def' });
});

it('keeps start and end head selectors as separate dropdown fields', async () => {
  const props = createProps();
  render(<>{renderArrowControlsSection(props as never)}</>);

  act(() => {
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'editor.compact.arrowHeadGroup')
      ?.click();
  });
  const startSelect = container?.querySelector(
    '[role="group"][aria-label="editor.compact.arrowStartHead"]'
  );
  const endSelect = container?.querySelector(
    '[role="group"][aria-label="editor.compact.arrowEndHead"]'
  );

  act(() => {
    Array.from(startSelect?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent === 'Open')
      ?.click();
    Array.from(endSelect?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent === 'Block')
      ?.click();
  });

  expect(props.applyArrowPatch).toHaveBeenCalledWith({ startHead: 'open' });
  expect(props.applyArrowPatch).toHaveBeenCalledWith({ endHead: 'block' });
  expect(startSelect).not.toBeNull();
  expect(endSelect).not.toBeNull();
});
