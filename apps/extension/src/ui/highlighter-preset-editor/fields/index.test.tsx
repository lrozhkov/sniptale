// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../color-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../color-selector')>()),
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

import { BorderPresetEditorFields } from '.';
import { createBaseState, type BorderPresetEditorTestState } from '../content.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

function createState(overrides: Partial<BorderPresetEditorTestState> = {}) {
  return {
    ...createBaseState(),
    radius: 6,
    ...overrides,
  };
}

async function renderFields(state: ReturnType<typeof createState>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<BorderPresetEditorFields state={state} />);
  });
}

function queryFieldElements() {
  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  const colorSelectors = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[data-testid="compact-color-selector"]') ?? []
  );

  return {
    colorSelectors,
    nameInput: container?.querySelector('input[type="text"]') as HTMLInputElement,
    numberInputs: Array.from(
      container?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? []
    ),
    ranges: Array.from(container?.querySelectorAll<HTMLInputElement>('input[type="range"]') ?? []),
    resizeHandle: container?.querySelector('div[style*="ns-resize"]') as HTMLDivElement,
    styleButton: buttons.find((button) =>
      button.textContent?.includes('highlighter.editor.styleSolid')
    ),
    textarea: container?.querySelector('textarea') as HTMLTextAreaElement,
  };
}

function getRangeInput(label: string) {
  const input = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input[type="range"]') ?? []
  ).find((candidate) => candidate.getAttribute('aria-label') === label);
  if (!input) throw new Error(`Missing range input: ${label}`);
  return input;
}

async function interactWithFields(state: ReturnType<typeof createBaseState>) {
  const { colorSelectors, nameInput, numberInputs, resizeHandle, styleButton, textarea } =
    queryFieldElements();

  await act(async () => {
    setInputValue(nameInput, 'Updated preset');
    colorSelectors[0]?.click();
    colorSelectors[1]?.click();
    setInputValue(textarea, 'border-color: blue;');
    setInputValue(numberInputs[0] as HTMLInputElement, '11');
    setInputValue(numberInputs[3] as HTMLInputElement, '14');
    setInputValue(getRangeInput('highlighter.editor.widthLabel'), '7');
    setInputValue(getRangeInput('highlighter.editor.radiusLabel'), '8');
    setInputValue(getRangeInput('highlighter.editor.strokeOpacityLabel'), '65');
    setInputValue(getRangeInput('highlighter.editor.fillOpacityLabel'), '55');
    setInputValue(getRangeInput('highlighter.editor.shadowLabel'), '100');
    styleButton?.click();
    resizeHandle?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  expect(state.setName).toHaveBeenCalledWith('Updated preset');
  expect(state.setColor).toHaveBeenCalledWith('#123456');
  expect(state.setFillColor).toHaveBeenCalledWith('#123456');
  expect(state.setCustomCss).toHaveBeenCalledWith('border-color: blue;');
  expect(state.updatePadding).toHaveBeenCalledWith('top', 11);
  expect(state.updatePadding).toHaveBeenCalledWith('left', 14);
  expect(state.setStyle).toHaveBeenCalledWith('solid');
  expect(state.setShadow).toHaveBeenCalledWith(100);
  expect(state.handleResizeStart).toHaveBeenCalledOnce();
  expect(state.setWidth).toHaveBeenCalledWith(7);
  expect(state.setRadius).toHaveBeenCalledWith(8);
  expect(state.setStrokeOpacity).toHaveBeenCalledWith(65);
  expect(state.setFillOpacity).toHaveBeenCalledWith(55);
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

describe('BorderPresetEditorFields', () => {
  it('renders preview, toggles style and shadow, and wires every editable field', async () => {
    const state = createState();

    await renderFields(state);

    expect(container?.textContent).toContain('highlighter.editor.previewLabel');
    expect(container?.textContent).toContain('highlighter.editor.nameLabel');
    expect(container?.textContent).toContain('highlighter.editor.customCssLabel');
    expect(container?.textContent).toContain('highlighter.editor.previewSampleText');
    expect(container?.textContent).not.toContain('highlighter.editor.opacityLabel');
    expect(container?.querySelector('input[type="checkbox"]')).toBeNull();

    await interactWithFields(state);
  });

  it('shows css validation feedback when an error is present', async () => {
    await renderFields(createState({ cssError: 'invalid-css' }));

    expect(container?.textContent).toContain('invalid-css');
    expect(container?.querySelector('.border-2')).toBeTruthy();
  });
});
