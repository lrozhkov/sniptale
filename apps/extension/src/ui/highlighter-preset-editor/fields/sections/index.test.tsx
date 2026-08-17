// @vitest-environment jsdom

import { act } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../color-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../color-selector')>()),
  CompactColorSelector: ({
    label,
    onChange,
    value,
  }: {
    label: string;
    onChange: (value: string) => void;
    value: string;
  }) => (
    <button type="button" data-testid="compact-color-selector" onClick={() => onChange('#123456')}>
      {label}:{value}
    </button>
  ),
}));

vi.mock('../fill-paint-field', () => ({
  HighlighterFillPaintField: ({
    label,
    onChange,
  }: {
    label: string;
    onChange: (value: unknown) => void;
  }) => (
    <button
      type="button"
      data-testid="compact-paint-selector"
      onClick={() => onChange({ kind: 'solid', color: '#123456ff' })}
    >
      {label}
    </button>
  ),
  HighlighterFillSurfaceField: () => <div data-testid="surface-selector" />,
}));

import { EditorBasicSettings } from './basic-settings';
import { EditorCustomCssField } from './custom-css-field';
import { EditorPaddingFields } from './padding-fields';
import { EditorPreview } from './sample';
import { EditorShadowField } from './shadow-buttons';
import { createBaseState, type BorderPresetEditorTestState } from '../../content.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(overrides: Partial<BorderPresetEditorTestState> = {}) {
  return {
    ...createBaseState(),
    radius: 6,
    ...overrides,
  };
}

async function renderUi(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNumericInputValue(element: HTMLInputElement, value: string) {
  element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  setInputValue(element, value);
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

function getNumericInput(label: string) {
  const input = container?.querySelector<HTMLInputElement>(
    `input[type="text"][aria-label="${label}"]`
  );
  if (!input) throw new Error(`Missing numeric input: ${label}`);
  return input;
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
  vi.unstubAllGlobals();
});

it('renders the text-backed preview state and error feedback', async () => {
  await renderUi(<EditorPreview state={createState()} />);

  expect(container?.textContent).toContain('highlighter.editor.previewLabel');
  expect(container?.textContent).toContain('highlighter.editor.previewSampleText');

  await renderUi(<EditorPreview state={createState({ cssError: 'invalid-css' })} />);

  expect(container?.textContent).toContain('invalid-css');
  expect(container?.querySelector('.border-2')).toBeTruthy();
});

it('wires compact color selectors, numeric inspectors, and style controls', async () => {
  const state = createState({ fillPaint: { kind: 'solid' as const, color: '#00000000' } });

  await renderUi(<EditorBasicSettings state={state} />);

  const colorSelectors = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[data-testid="compact-color-selector"]') ?? []
  );
  expect(colorSelectors).toHaveLength(1);
  expect(container?.textContent).not.toContain('highlighter.editor.opacityLabel');

  await act(async () => {
    colorSelectors[0]?.click();
    container?.querySelector<HTMLButtonElement>('[data-testid="compact-paint-selector"]')?.click();
    const widthInput = getNumericInput('highlighter.editor.widthLabel');
    const radiusInput = getNumericInput('highlighter.editor.radiusLabel');
    setNumericInputValue(widthInput, '7');
    setNumericInputValue(radiusInput, '8');
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent?.includes('highlighter.editor.styleSolid'))
      ?.click();
  });

  expect(state.setColor).toHaveBeenCalledWith('#123456');
  expect(state.setFillPaint).toHaveBeenCalledWith({ kind: 'solid', color: '#123456ff' });
  expect(state.setWidth).toHaveBeenCalledWith(7);
  expect(state.setRadius).toHaveBeenCalledWith(8);
  expect(state.setStyle).toHaveBeenCalledWith('solid');
});

it('wires shadow, padding, and custom-css controls', async () => {
  const state = createState();

  await renderUi(
    <>
      <EditorShadowField state={state} />
      <EditorPaddingFields padding={state.padding} updatePadding={state.updatePadding} />
      <EditorCustomCssField state={state} />
    </>
  );

  const numberInputs = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? []
  );

  await act(async () => {
    const shadowInput = getNumericInput('highlighter.editor.shadowLabel');
    setNumericInputValue(shadowInput, '100');
    setInputValue(numberInputs[0] as HTMLInputElement, '11');
    setInputValue(numberInputs[3] as HTMLInputElement, '14');
    setInputValue(container?.querySelector('textarea') as HTMLTextAreaElement, 'border: 1px solid');
    container
      ?.querySelector('div[style*="ns-resize"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  expect(state.setShadow).toHaveBeenCalledWith(100);
  expect(container?.querySelector('input[type="checkbox"]')).toBeNull();
  expect(state.setInheritCustomCss).toHaveBeenCalledWith(true);
  expect(state.updatePadding).toHaveBeenCalledWith('top', 11);
  expect(state.updatePadding).toHaveBeenCalledWith('left', 14);
  expect(state.setCustomCss).toHaveBeenCalledWith('border: 1px solid');
  expect(state.handleResizeStart).toHaveBeenCalledOnce();
});
