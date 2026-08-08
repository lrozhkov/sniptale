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
import { BorderStyleInspector } from './inspector';
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

function setNumericInputValue(element: HTMLInputElement, value: string) {
  element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  setInputValue(element, value);
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
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
  const colorSelectors = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[data-testid="compact-color-selector"]') ?? []
  );

  return {
    colorSelectors,
    nameInput: container?.querySelector('input[type="text"]') as HTMLInputElement,
    paddingInputs: Array.from(
      container?.querySelectorAll<HTMLInputElement>('[data-padding-side] input') ?? []
    ),
    resizeHandle: container?.querySelector('div[style*="ns-resize"]') as HTMLDivElement,
    styleSelect: container?.querySelector<HTMLButtonElement>(
      'button[aria-label="highlighter.editor.styleLabel"]'
    ),
    textarea: container?.querySelector('textarea') as HTMLTextAreaElement,
  };
}

function getNumericInput(label: string) {
  const input = container?.querySelector<HTMLInputElement>(
    `input[type="text"][aria-label="${label}"]`
  );
  if (!input) throw new Error(`Missing numeric input: ${label}`);
  return input;
}

function selectCategory(label: string) {
  const button = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Missing inspector category: ${label}`);
  act(() => button.click());
}

async function interactWithFields(state: ReturnType<typeof createBaseState>) {
  await act(async () => {
    const { colorSelectors, nameInput, styleSelect } = queryFieldElements();
    setInputValue(nameInput, 'Updated preset');
    colorSelectors[0]?.click();
    const widthInput = getNumericInput('highlighter.editor.widthLabel');
    setNumericInputValue(widthInput, '7');
    styleSelect?.click();
  });
  await act(async () => {
    const dashedOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (option) => option.textContent === 'highlighter.editor.styleDashed'
    );
    dashedOption?.click();
  });

  selectCategory('highlighter.editor.fillSection');
  expect(container?.textContent).not.toContain('highlighter.editor.noFill');
  await act(async () => {
    queryFieldElements().colorSelectors[0]?.click();
  });

  selectCategory('highlighter.editor.geometrySection');
  await act(async () => {
    container?.querySelector<HTMLButtonElement>('[data-padding-link="all"]')?.click();
    container?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click();
  });
  await act(async () => {
    container?.querySelector<HTMLButtonElement>('[data-padding-link="vertical"]')?.click();
    container?.querySelector<HTMLButtonElement>('[data-padding-link="horizontal"]')?.click();
  });
  await act(async () => {
    const { paddingInputs } = queryFieldElements();
    const leftPadding = container?.querySelector<HTMLInputElement>(
      '[data-padding-side="left"] input'
    );
    paddingInputs[0]?.focus();
    setInputValue(paddingInputs[0] as HTMLInputElement, '11');
    paddingInputs[0]?.blur();
    leftPadding?.focus();
    setInputValue(leftPadding as HTMLInputElement, '14');
    leftPadding?.blur();
    const radiusInput = getNumericInput('highlighter.editor.radiusLabel');
    setNumericInputValue(radiusInput, '8');
  });

  selectCategory('highlighter.editor.shadowSection');
  await act(async () => {
    const shadowInput = getNumericInput('highlighter.editor.shadowLabel');
    setNumericInputValue(shadowInput, '100');
  });

  selectCategory('highlighter.editor.behaviorSection');
  await act(async () => {
    container
      ?.querySelector<HTMLButtonElement>(
        'button[aria-label="highlighter.editor.hideFrameDuringCaptureLabel"]'
      )
      ?.click();
  });

  selectCategory('highlighter.editor.customCssLabel');
  await act(async () => {
    const { resizeHandle, textarea } = queryFieldElements();
    setInputValue(textarea, 'border-color: blue;');
    resizeHandle?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  expect(state.setName).toHaveBeenCalledWith('Updated preset');
  expect(state.setColor).toHaveBeenCalledWith('#123456');
  expect(state.setFillColor).toHaveBeenCalledWith('#123456');
  expect(state.setCustomCss).toHaveBeenCalledWith('border-color: blue;');
  const paddingUpdates = vi
    .mocked(state.setPadding)
    .mock.calls.map(([update]) => (typeof update === 'function' ? update(state.padding) : update));
  expect(paddingUpdates).toContainEqual({ ...state.padding, top: 11 });
  expect(paddingUpdates).toContainEqual({ ...state.padding, left: 14 });
  expect(state.setStyle).toHaveBeenCalledWith('dashed');
  expect(state.setShadow).toHaveBeenCalledWith(100);
  expect(state.setEffects).toHaveBeenCalledWith(
    expect.objectContaining({ capture: { hideFrame: true } })
  );
  expect(state.handleResizeStart).toHaveBeenCalledOnce();
  expect(state.setWidth).toHaveBeenCalledWith(7);
  expect(state.setRadius).toHaveBeenCalledWith(8);
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
    expect(container?.textContent).toContain('highlighter.editor.previewSampleText');
    expect(container?.textContent).not.toContain('highlighter.editor.opacityLabel');
    expect(container?.querySelector('input[type="checkbox"]')).toBeNull();
    expect(
      container?.querySelector('[data-ui="shared.categorized-inspector.section-heading"]')
        ?.textContent
    ).toBe('highlighter.editor.outlineSection');
    expect(
      container?.querySelector('[data-field-label="highlighter.editor.styleLabel"]')
    ).not.toBeNull();
    const widthRow = getNumericInput('highlighter.editor.widthLabel').closest<HTMLElement>(
      '[data-ui="shared.ui.compact-inspector.numeric-row"]'
    );
    expect(widthRow).not.toBeNull();
    expect(
      widthRow?.querySelector('button[aria-label="highlighter.editor.widthLabel increase"]')
    ).not.toBeNull();
    vi.spyOn(widthRow as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 40,
      height: 40,
      left: 0,
      right: 240,
      top: 0,
      width: 240,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    act(() => {
      widthRow?.dispatchEvent(
        new MouseEvent('pointermove', { bubbles: true, clientX: 120, clientY: 35 })
      );
    });
    expect(widthRow?.dataset['rangeVisible']).toBe('true');
    expect(
      widthRow?.querySelector('input[aria-label="highlighter.editor.widthLabel range"]')
    ).not.toBeNull();

    await interactWithFields(state);
  });

  it('shows css validation feedback when an error is present', async () => {
    await renderFields(createState({ cssError: 'invalid-css' }));
    selectCategory('highlighter.editor.customCssLabel');

    expect(container?.textContent).toContain('invalid-css');
    expect(container?.querySelector('.border-2')).toBeTruthy();
  });

  it('lets the inline manual CSS field grow without the preset-editor resize owner', async () => {
    const state = createState();
    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
    await act(async () => {
      root?.render(
        <BorderStyleInspector
          cssDraft=""
          cssError={null}
          onChange={vi.fn()}
          onCssDraftChange={vi.fn()}
          style={state}
        />
      );
    });

    selectCategory('highlighter.editor.customCssLabel');
    const textarea = container.querySelector('textarea');
    expect(textarea?.className).toContain('resize-y');
    expect(textarea?.rows).toBe(5);
    expect(container.querySelector('div[style*="ns-resize"]')).toBeNull();
  });

  it('uses the same supported blur types as the frame menu', async () => {
    const state = createState();
    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
    await act(async () => {
      root?.render(
        <BorderStyleInspector
          cssDraft=""
          cssError={null}
          onChange={vi.fn()}
          onCssDraftChange={vi.fn()}
          style={state}
        />
      );
    });

    selectCategory('highlighter.editor.blurSection');
    const blurTypeSelect = container.querySelector<HTMLButtonElement>(
      '[aria-label="highlighter.editor.blurTypeLabel"]'
    );
    act(() => blurTypeSelect?.click());
    const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
      (option) => option.textContent
    );

    expect(options).toEqual([
      'highlighter.editor.blurTypeGaussian',
      'highlighter.editor.blurTypeDistortion',
      'highlighter.editor.blurTypeSolid',
    ]);
  });

  it('writes linked comment and numbering template identifiers through the behavior section', async () => {
    const state = createState();
    const onChange = vi.fn();
    if (!container) {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
    await act(async () => {
      root?.render(
        <BorderStyleInspector
          cssDraft=""
          cssError={null}
          linkedTemplateOptions={{
            callouts: [{ label: 'Linked comment', value: 'callout-1' }],
            stepBadges: [{ label: 'Linked number', value: 'badge-1' }],
          }}
          onChange={onChange}
          onCssDraftChange={vi.fn()}
          style={state}
        />
      );
    });

    selectCategory('highlighter.editor.behaviorSection');
    act(() => {
      container
        ?.querySelector<HTMLButtonElement>(
          '[aria-label="highlighter.editor.linkedCalloutTemplateLabel"]'
        )
        ?.click();
    });
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (candidate) => candidate.textContent === 'Linked comment'
    );
    act(() => option?.click());

    expect(onChange).toHaveBeenCalledWith({
      effects: expect.objectContaining({
        linkedTemplates: { calloutPresetId: 'callout-1', stepBadgePresetId: null },
      }),
    });
  });
});
