// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyStepMock: vi.fn(),
  commitDraftMock: vi.fn(),
  createDimensionDraftActionsMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('./dimension-input.helpers', () => ({
  createDimensionDraftActions: mocks.createDimensionDraftActionsMock,
}));

import { DimensionInput } from './dimension-input';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function setupDimensionInputMocks() {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.createDimensionDraftActionsMock.mockImplementation(() => ({
    applyStep: mocks.applyStepMock,
    commitDraft: mocks.commitDraftMock,
  }));
}

function renderDimensionInput(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

function getDimensionInput(label: string) {
  return container?.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
}

function clickDimensionButton(label: string) {
  act(() => {
    (
      container?.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null
    )?.click();
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('editor-inspector-sidebar shared dimension input', () => {
  beforeEach(setupDimensionInputMocks);

  it('steps a focused wheel through the dimension draft owner and preserves minimum', async () => {
    const actual = await vi.importActual<typeof import('./dimension-input.helpers')>(
      './dimension-input.helpers'
    );
    mocks.createDimensionDraftActionsMock.mockImplementation(actual.createDimensionDraftActions);
    const onChange = vi.fn();
    function Host() {
      const [value, setValue] = React.useState(10);
      return (
        <>
          <DimensionInput
            label="Width"
            value={value}
            min={2}
            step={3}
            onChange={(next) => {
              onChange(next);
              setValue(next);
            }}
          />
          <button type="button" data-external-dimension onClick={() => setValue(30)}>
            External dimension
          </button>
        </>
      );
    }
    renderDimensionInput(<Host />);
    const input = getDimensionInput('Width');
    act(() => input.focus());
    act(() => setInputValue(input, '4'));
    const down = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 1 });
    act(() => input.dispatchEvent(down));
    expect(input.value).toBe('2');
    expect(onChange).toHaveBeenLastCalledWith(2);
    expect(down.defaultPrevented).toBe(true);
    act(() => {
      input.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -1 }));
      input.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -1 }));
    });
    expect(input.value).toBe('8');
    expect(document.activeElement).toBe(input);
    act(() => setInputValue(input, ''));
    act(() =>
      input.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -1 }))
    );
    expect(input.value).toBe('11');
    act(() => container?.querySelector<HTMLButtonElement>('[data-external-dimension]')?.click());
    expect(input.value).toBe('30');
    act(() =>
      input.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 1 }))
    );
    expect(input.value).toBe('27');
  });

  it('filters draft input, commits changes, and supports keyboard resets', () => {
    renderDimensionInput(<DimensionInput label="Width" value={120} onChange={vi.fn()} />);

    const input = getDimensionInput('Width');
    const label = container?.querySelector('span');

    expect(label?.className).toContain('text-[12px] font-semibold uppercase');
    expect(label?.className).not.toContain('tracking-');
    expect(input.className).toContain(
      'font-semibold text-[color:var(--sniptale-color-text-primary)]'
    );
    expect(input.className).not.toContain('tracking-');

    act(() => {
      setInputValue(input, '12a3');
    });
    expect(input.value).toBe('123');

    act(() => {
      input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
      setInputValue(input, '999');
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(mocks.commitDraftMock).toHaveBeenCalled();
    expect(input.value).toBe('120');
  });

  it('applies stepper actions and syncs the draft when the value prop changes', () => {
    renderDimensionInput(<DimensionInput label="Height" value={240} onChange={vi.fn()} />);

    clickDimensionButton('Height editor.compact.increaseAriaSuffix');
    clickDimensionButton('Height editor.compact.decreaseAriaSuffix');

    act(() => root?.render(<DimensionInput label="Height" value={360} onChange={vi.fn()} />));

    expect(mocks.applyStepMock).toHaveBeenCalledWith(1);
    expect(mocks.applyStepMock).toHaveBeenCalledWith(-1);
    expect(getDimensionInput('Height').value).toBe('360');
  });
});
