// @vitest-environment jsdom

import { act } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('../../../../../section-surface', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../section-surface')>()),
  SettingsRangeField: ({
    displaySuffix,
    label,
    max,
    min,
    onChange,
    value,
  }: {
    displaySuffix?: string;
    label: string;
    max: string;
    min: string;
    onChange: (event: { target: { value: string } }) => void;
    value: number;
  }) => (
    <label>
      <span>{label}</span>
      <input
        data-testid="settings-range"
        type="range"
        min={min}
        max={max}
        value={value}
        data-suffix={displaySuffix}
        onChange={(event) => onChange({ target: { value: event.currentTarget.value } })}
      />
    </label>
  ),
}));

import {
  EditorBasicSettings,
  EditorCustomCssField,
  EditorPaddingFields,
  EditorPreview,
  EditorShadowField,
} from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(overrides: Record<string, unknown> = {}) {
  return {
    color: '#ff6600',
    cssError: null as string | null,
    customCss: 'color: blue;',
    fillColor: '#00000000',
    fillOpacity: 0,
    handleResizeStart: vi.fn(),
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

it('renders preview state and error feedback', async () => {
  await renderUi(<EditorPreview state={createState() as never} />);

  expect(container?.textContent).toContain('highlighter.editor.previewLabel');

  await renderUi(<EditorPreview state={createState({ cssError: 'invalid-css' }) as never} />);

  expect(container?.textContent).toContain('invalid-css');
  expect(container?.querySelector('.border-2')).toBeTruthy();
});

it('wires basic settings through range, color, and style controls', async () => {
  const state = createState({ fillColor: 'transparent' });

  await renderUi(<EditorBasicSettings state={state as never} />);

  const colorInputs = Array.from(container?.querySelectorAll('input[type="text"]') ?? []);
  const colorPickers = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input[type="color"]') ?? []
  );
  const ranges = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input[data-testid="settings-range"]') ?? []
  );

  expect(colorPickers[1]?.value).toBe('#000000');

  await act(async () => {
    setInputValue(colorPickers[0] as HTMLInputElement, '#00ff00');
    setInputValue(colorInputs[0] as HTMLInputElement, '#123456');
    setInputValue(ranges[0] as HTMLInputElement, '7');
    setInputValue(ranges[1] as HTMLInputElement, '8');
    setInputValue(ranges[2] as HTMLInputElement, '65');
    setInputValue(ranges[4] as HTMLInputElement, '55');
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent?.includes('highlighter.editor.styleSolid'))
      ?.click();
  });

  expect(state.setColor).toHaveBeenCalledWith('#00ff00');
  expect(state.setColor).toHaveBeenCalledWith('#123456');
  expect(state.setWidth).toHaveBeenCalledWith(7);
  expect(state.setRadius).toHaveBeenCalledWith(8);
  expect(state.setStrokeOpacity).toHaveBeenCalledWith(65);
  expect(state.setOpacity).toHaveBeenCalledWith(55);
  expect(state.setStyle).toHaveBeenCalledWith('solid');
});

it('wires shadow, padding, and custom-css controls', async () => {
  const state = createState();

  await renderUi(
    <>
      <EditorShadowField state={state as never} />
      <EditorPaddingFields
        padding={state.padding as never}
        updatePadding={state.updatePadding as never}
      />
      <EditorCustomCssField state={state as never} />
    </>
  );

  const numberInputs = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? []
  );

  await act(async () => {
    setInputValue(
      container?.querySelector<HTMLInputElement>(
        'input[data-testid="settings-range"]'
      ) as HTMLInputElement,
      '100'
    );
    container?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    setInputValue(numberInputs[0] as HTMLInputElement, '11');
    setInputValue(numberInputs[3] as HTMLInputElement, '14');
    setInputValue(container?.querySelector('textarea') as HTMLTextAreaElement, 'border: 1px solid');
    container
      ?.querySelector('div[style*="ns-resize"]')
      ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  expect(state.setShadow).toHaveBeenCalledWith(100);
  expect(state.setInheritCustomCss).toHaveBeenCalledWith(true);
  expect(state.updatePadding).toHaveBeenCalledWith('top', 11);
  expect(state.updatePadding).toHaveBeenCalledWith('left', 14);
  expect(state.setCustomCss).toHaveBeenCalledWith('border: 1px solid');
  expect(state.handleResizeStart).toHaveBeenCalledOnce();
});
