// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('../../../../../ui/color-selector', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../ui/color-selector')>()),
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

function createBaseState() {
  return {
    color: '#ff6600',
    cssError: null as string | null,
    customCss: 'color: blue;',
    fillColor: '#00000000',
    fillOpacity: 0,
    handleResizeStart: vi.fn(),
    hasBlockedProps: false,
    inheritCustomCss: false,
    name: 'Preset',
    opacity: 80,
    padding: { top: 1, right: 2, bottom: 3, left: 4 },
    previewStyle: { borderColor: '#ff6600', borderWidth: '3px' },
    radius: 6,
    setColor: vi.fn(),
    setCustomCss: vi.fn(),
    setFillColor: vi.fn(),
    setFillOpacity: vi.fn(),
    setInheritCustomCss: vi.fn(),
    setName: vi.fn(),
    setOpacity: vi.fn(),
    setRadius: vi.fn(),
    setShadow: vi.fn(),
    setStyle: vi.fn(),
    setStrokeOpacity: vi.fn(),
    setWidth: vi.fn(),
    shadow: 30,
    style: 'dashed' as const,
    textareaHeight: 96,
    updatePadding: vi.fn(),
    width: 3,
  };
}

function createState(overrides: Partial<ReturnType<typeof createBaseState>> = {}) {
  return {
    ...createBaseState(),
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
    root?.render(<BorderPresetEditorFields state={state as never} />);
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

async function interactWithFields(state: ReturnType<typeof createBaseState>) {
  const { colorSelectors, nameInput, numberInputs, ranges, resizeHandle, styleButton, textarea } =
    queryFieldElements();

  await act(async () => {
    setInputValue(nameInput, 'Updated preset');
    colorSelectors[0]?.click();
    colorSelectors[1]?.click();
    setInputValue(textarea, 'border-color: blue;');
    setInputValue(numberInputs[0] as HTMLInputElement, '11');
    setInputValue(numberInputs[3] as HTMLInputElement, '14');
    setInputValue(ranges[0] as HTMLInputElement, '7');
    setInputValue(ranges[1] as HTMLInputElement, '8');
    setInputValue(ranges[2] as HTMLInputElement, '65');
    setInputValue(ranges[3] as HTMLInputElement, '55');
    setInputValue(ranges[4] as HTMLInputElement, '100');
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
