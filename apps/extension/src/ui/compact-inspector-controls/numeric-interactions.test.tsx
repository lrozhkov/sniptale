// @vitest-environment jsdom

import { act, useState } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { OpacityField } from './inspector-numeric-fields';
import { NumericRow, NumericValueField } from './numeric';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNumeric(props: Partial<React.ComponentProps<typeof NumericValueField>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onPreviewValue = props.onPreviewValue ?? vi.fn();
  const onCommitValue = props.onCommitValue ?? vi.fn();

  act(() => {
    root?.render(
      <NumericValueField
        label="Opacity"
        value={40}
        unit="%"
        min={0}
        max={100}
        step={5}
        onPreviewValue={onPreviewValue}
        onCommitValue={onCommitValue}
        {...props}
      />
    );
  });

  return { onCommitValue, onPreviewValue };
}

function input() {
  const field = container?.querySelector<HTMLInputElement>('input[aria-label="Opacity"]');
  if (!field) {
    throw new Error('numeric input missing');
  }
  return field;
}

function setInputValue(field: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function createPointerEvent(type: string, init: PointerEventInit & { pointerType?: string } = {}) {
  const PointerEventCtor = globalThis.PointerEvent ?? MouseEvent;
  const event = new PointerEventCtor(type, init);
  Object.defineProperty(event, 'pointerId', { configurable: true, value: init.pointerId ?? 1 });
  Object.defineProperty(event, 'pointerType', {
    configurable: true,
    value: init.pointerType ?? 'mouse',
  });
  return event;
}

function mountOpacity(props: Partial<React.ComponentProps<typeof OpacityField>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onChange = props.onChange ?? vi.fn();
  act(() =>
    root?.render(
      <OpacityField
        copy={{ apply: 'Apply', editOpacity: 'Edit opacity', invalid: () => 'Invalid opacity' }}
        label="Opacity"
        value={40}
        max={100}
        onChange={onChange}
        {...props}
      />
    )
  );
  return { host: container, slider: container.querySelector<HTMLInputElement>('input')!, onChange };
}

afterEach(() => {
  vi.useRealTimers();
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('uses exact arrow steps only for an opted-in field and leaves modified and composing keys alone', () => {
  const { onCommitValue, onPreviewValue } = renderNumeric({ keyboardStep: true });
  const field = input();
  act(() => field.focus());
  const press = (key: string, modifiers: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
      ...modifiers,
    });
    act(() => field.dispatchEvent(event));
    return event.defaultPrevented;
  };
  expect(press('ArrowUp')).toBe(true);
  expect(field.value).toBe('45');
  expect(press('ArrowDown')).toBe(true);
  expect(field.value).toBe('40');
  expect(press('ArrowUp', { isComposing: true })).toBe(false);
  expect(press('ArrowDown', { altKey: true })).toBe(false);
  expect(field.value).toBe('40');
  expect(onPreviewValue).toHaveBeenCalledTimes(2);
  expect(onCommitValue).toHaveBeenNthCalledWith(1, 45);
  expect(onCommitValue).toHaveBeenNthCalledWith(2, 40);
});

it('steps focused wheel through irregular domain boundaries and commits without blur duplicates', () => {
  const getStepValue = vi.fn((value: number, direction: 1 | -1) =>
    direction === 1 ? (value < 12 ? 12 : 20) : value === 20 ? 12 : 0
  );
  const { onCommitValue, onPreviewValue } = renderNumeric({
    value: 10,
    getStepValue,
    precision: 2,
    unit: 'px',
  });
  const field = input();
  const unfocused = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 });
  act(() => field.dispatchEvent(unfocused));
  expect(unfocused.defaultPrevented).toBe(false);
  expect(onCommitValue).not.toHaveBeenCalled();
  act(() => field.focus());
  const scrolling = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 });
  act(() => field.dispatchEvent(scrolling));
  expect(scrolling.defaultPrevented).toBe(false);
  expect(onCommitValue).not.toHaveBeenCalled();
  const wheel = () =>
    field.dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, altKey: true })
    );
  act(() => {
    wheel();
    wheel();
  });
  expect(field.value).toBe('20');
  expect(getStepValue).toHaveBeenNthCalledWith(1, 10, 1);
  expect(getStepValue).toHaveBeenNthCalledWith(2, 12, 1);
  expect(onPreviewValue).toHaveBeenCalledTimes(2);
  expect(onPreviewValue).toHaveBeenNthCalledWith(1, 12);
  expect(onPreviewValue).toHaveBeenNthCalledWith(2, 20);
  expect(onCommitValue).toHaveBeenCalledTimes(2);
  expect(onCommitValue).toHaveBeenNthCalledWith(1, 12);
  expect(onCommitValue).toHaveBeenNthCalledWith(2, 20);
  expect(document.activeElement).toBe(field);
  act(() => field.blur());
  expect(onCommitValue).toHaveBeenCalledTimes(2);
});

it('previews stepper repeats and commits the completed hold once', () => {
  vi.useFakeTimers();
  const { onCommitValue, onPreviewValue } = renderNumeric({ step: 5, value: 10 });
  const increase = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Opacity increase"]'
  );

  act(() => {
    increase?.dispatchEvent(
      createPointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse' })
    );
    vi.advanceTimersByTime(220);
    vi.advanceTimersByTime(70);
    vi.advanceTimersByTime(70);
  });

  expect(onPreviewValue).toHaveBeenNthCalledWith(1, 15);
  expect(onPreviewValue).toHaveBeenNthCalledWith(2, 20);
  expect(onPreviewValue).toHaveBeenNthCalledWith(3, 25);
  expect(onCommitValue).not.toHaveBeenCalled();
  act(() =>
    window.dispatchEvent(
      createPointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse' })
    )
  );
  expect(onCommitValue).toHaveBeenCalledExactlyOnceWith(25);
});

it('keeps units display-only while editing and restores invalid drafts', () => {
  const { onCommitValue, onPreviewValue } = renderNumeric({ value: 90 });

  act(() => {
    input().dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    setInputValue(input(), '75%');
  });

  expect(container?.textContent).toContain('%');
  expect(input().value).toBe('75');
  expect(onPreviewValue).not.toHaveBeenCalled();

  act(() => {
    setInputValue(input(), 'bad');
    input().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  });

  expect(input().value).toBe('90');
  expect(onCommitValue).not.toHaveBeenCalled();
});

it.each(['pointercancel', 'Escape', 'Undo', 'blur', 'unmount'])(
  'restores the accepted value without committing a held stepper on %s',
  (interruption) => {
    vi.useFakeTimers();
    const { onCommitValue, onPreviewValue } = renderNumeric({ value: 10, step: 5 });
    const button = container!.querySelector('button[aria-label="Opacity increase"]')!;
    act(() => {
      button.dispatchEvent(createPointerEvent('pointerdown', { bubbles: true }));
      vi.advanceTimersByTime(300);
    });
    expect(input().value).toBe('20');
    act(() => {
      if (interruption === 'unmount') {
        root!.unmount();
        root = null;
      } else if (interruption === 'Escape' || interruption === 'Undo') {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: interruption === 'Escape' ? 'Escape' : 'z',
            ctrlKey: interruption === 'Undo',
            bubbles: true,
            cancelable: true,
          })
        );
      } else if (interruption === 'blur') window.dispatchEvent(new Event('blur'));
      else window.dispatchEvent(createPointerEvent('pointercancel'));
    });
    expect(onPreviewValue).toHaveBeenLastCalledWith(10);
    if (root) expect(input().value).toBe('10');
    act(() => {
      window.dispatchEvent(createPointerEvent('pointerup'));
      vi.advanceTimersByTime(500);
    });
    expect(onCommitValue).not.toHaveBeenCalled();
    expect(onPreviewValue).toHaveBeenCalledTimes(3);
  }
);

it('keeps two completed holds separate and ignores another pointer release', () => {
  vi.useFakeTimers();
  const { onCommitValue } = renderNumeric({ value: 10, step: 5 });
  const button = container!.querySelector('button[aria-label="Opacity increase"]')!;
  act(() => {
    button.dispatchEvent(createPointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    window.dispatchEvent(createPointerEvent('pointerup', { pointerId: 2 }));
    vi.advanceTimersByTime(300);
  });
  expect(onCommitValue).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(createPointerEvent('pointerup', { pointerId: 1 })));
  expect(onCommitValue).toHaveBeenCalledExactlyOnceWith(20);
  act(() => {
    button.dispatchEvent(createPointerEvent('pointerdown', { bubbles: true, pointerId: 3 }));
    window.dispatchEvent(createPointerEvent('pointerup', { pointerId: 3 }));
  });
  expect(onCommitValue).toHaveBeenCalledTimes(2);
  expect(onCommitValue).toHaveBeenNthCalledWith(1, 20);
  expect(onCommitValue).toHaveBeenNthCalledWith(2, 25);
});

it('does not accept an empty stepper action at the numeric boundary', () => {
  const { onCommitValue } = renderNumeric({ value: 100 });
  act(() => {
    container!
      .querySelector('button[aria-label="Opacity increase"]')!
      .dispatchEvent(createPointerEvent('pointerdown', { bubbles: true }));
    window.dispatchEvent(createPointerEvent('pointerup'));
  });
  expect(onCommitValue).not.toHaveBeenCalled();
});

it.each([false, true])('keeps an indeterminate value isolated until accepted=%s', (accept) => {
  const { onCommitValue, onPreviewValue } = renderNumeric({ value: null, step: 5 });
  act(() => {
    container!
      .querySelector('button[aria-label="Opacity increase"]')!
      .dispatchEvent(createPointerEvent('pointerdown', { bubbles: true }));
  });
  expect(input().value).toBe('5');
  expect(onPreviewValue).not.toHaveBeenCalled();
  act(() => window.dispatchEvent(createPointerEvent(accept ? 'pointerup' : 'pointercancel')));
  expect(input().value).toBe(accept ? '5' : '');
  expect(onCommitValue).toHaveBeenCalledTimes(accept ? 1 : 0);
  if (accept) expect(onCommitValue).toHaveBeenCalledWith(5);
  expect(onPreviewValue).not.toHaveBeenCalled();
});

it('keeps the unit visible outside the input when the stepper changes an active edit field', () => {
  const { onCommitValue } = renderNumeric({ step: 1, unit: 'px', value: 18 });
  const increase = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Opacity increase"]'
  );

  act(() => {
    input().focus();
    increase?.dispatchEvent(createPointerEvent('pointerdown', { bubbles: true }));
    window.dispatchEvent(createPointerEvent('pointerup', { bubbles: true }));
  });

  expect(input().value).toBe('19');
  expect(container?.textContent).toContain('px');
  expect(onCommitValue).toHaveBeenCalledWith(19);
});

it('commits Enter and focuses the next numeric text input in the compact form', () => {
  const onCommitValue = vi.fn();
  const onPreviewValue = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <div>
        <NumericRow
          label="Width"
          value={20}
          unit="px"
          onPreviewValue={onPreviewValue}
          onCommitValue={onCommitValue}
        />
        <NumericRow
          label="Opacity"
          value={40}
          unit="%"
          onPreviewValue={() => undefined}
          onCommitValue={() => undefined}
        />
      </div>
    );
  });
  const inputs = container.querySelectorAll<HTMLInputElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-value-field"] input'
  );

  act(() => {
    inputs[0]?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    setInputValue(inputs[0]!, '28');
    inputs[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onCommitValue).toHaveBeenCalledWith(28);
  expect(document.activeElement).toBe(inputs[1]);
});

it('skips hidden and disabled form inputs when Enter advances focus', () => {
  const onCommitValue = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <form>
        <NumericRow
          label="Width"
          value={20}
          unit="px"
          onPreviewValue={() => undefined}
          onCommitValue={onCommitValue}
        />
        <input aria-label="Hidden field" hidden />
        <input aria-label="Disabled field" disabled />
        <input aria-label="Next field" />
      </form>
    );
  });

  const widthInput = container.querySelector<HTMLInputElement>('input[aria-label="Width"]');
  const nextInput = container.querySelector<HTMLInputElement>('input[aria-label="Next field"]');

  act(() => {
    widthInput?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    setInputValue(widthInput!, '32');
    widthInput?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onCommitValue).toHaveBeenCalledWith(32);
  expect(document.activeElement).toBe(nextInput);
});

it('blurs the last compact numeric input after Enter commit', () => {
  const onCommitValue = vi.fn();
  renderNumeric({ onCommitValue, value: 12 });
  const field = container?.querySelector<HTMLInputElement>('input[aria-label="Opacity"]');

  act(() => {
    field?.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    setInputValue(field!, '18');
    field?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onCommitValue).toHaveBeenCalledWith(18);
  expect(document.activeElement).not.toBe(field);
});

it('keeps mixed and disabled values inert', () => {
  const { onCommitValue, onPreviewValue } = renderNumeric({
    disabled: true,
    scrub: { min: 0, max: 100, step: 1 },
    value: null,
  });
  const increase = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Opacity increase"]'
  );
  const range = container?.querySelector<HTMLInputElement>('input[aria-label="Opacity range"]');

  act(() => {
    increase?.dispatchEvent(
      createPointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse' })
    );
  });

  expect(input().disabled).toBe(true);
  expect(input().placeholder).toBe('—');
  expect(range).toBeNull();
  expect(onPreviewValue).not.toHaveBeenCalled();
  expect(onCommitValue).not.toHaveBeenCalled();
});

it('does not restore a stale coupled dimension when a focused pristine field receives new props', () => {
  const { onCommitValue, onPreviewValue } = renderNumeric({ value: 40 });
  act(() => input().focus());
  act(() =>
    root?.render(
      <NumericValueField
        label="Opacity"
        value={80}
        unit="%"
        min={0}
        max={100}
        step={5}
        onPreviewValue={onPreviewValue}
        onCommitValue={onCommitValue}
      />
    )
  );
  expect(input().value).toBe('80');
  act(() => input().blur());
  expect(onCommitValue).not.toHaveBeenCalledWith(40);
});

it('preserves an explicitly edited draft when a related parameter updates', () => {
  const { onCommitValue, onPreviewValue } = renderNumeric({ value: 40 });
  act(() => input().focus());
  act(() => setInputValue(input(), '55'));
  act(() =>
    root?.render(
      <NumericValueField
        label="Opacity"
        value={80}
        unit="%"
        min={0}
        max={100}
        step={5}
        onPreviewValue={onPreviewValue}
        onCommitValue={onCommitValue}
      />
    )
  );
  expect(input().value).toBe('55');
  act(() => input().blur());
  expect(onCommitValue).toHaveBeenCalledWith(55);
});

it.each([false, true])('keeps only current numeric focus (shadow root: %s)', (shadow) => {
  const frames: FrameRequestCallback[] = [];
  const frame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  renderNumeric();
  const host = document.createElement('div');
  document.body.append(host);
  const focusRoot = shadow ? host.attachShadow({ mode: 'closed' }) : document;
  if (focusRoot instanceof ShadowRoot) focusRoot.append(container!);
  const field = input();
  const select = vi.spyOn(field, 'select');
  const next = document.createElement('button');
  container!.append(next);
  try {
    act(() => field.focus());
    act(() => next.focus());
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    expect(select).not.toHaveBeenCalled();
    expect(focusRoot.activeElement).toBe(next);
    act(() => field.focus());
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    expect(select).toHaveBeenCalledOnce();
  } finally {
    frame.mockRestore();
    select.mockRestore();
    host.remove();
  }
});

it('commits once and exits on Enter when blur behavior is requested', () => {
  const onCommitValue = vi.fn();
  const onPreviewValue = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <div>
        <NumericRow
          enterBehavior="blur"
          label="Width"
          value={20}
          unit="px"
          onPreviewValue={onPreviewValue}
          onCommitValue={onCommitValue}
        />
        <NumericRow
          label="Opacity"
          value={40}
          unit="%"
          onPreviewValue={() => undefined}
          onCommitValue={() => undefined}
        />
      </div>
    );
  });
  const inputs = container.querySelectorAll<HTMLInputElement>(
    '[data-ui="shared.ui.compact-inspector.numeric-value-field"] input'
  );

  act(() => {
    inputs[0]?.focus();
    setInputValue(inputs[0]!, '28');
    inputs[0]?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(onCommitValue).toHaveBeenCalledExactlyOnceWith(28);
  expect(container.contains(document.activeElement)).toBe(false);
});

it('previews opacity gestures and commits only when they finish', () => {
  const onPreview = vi.fn();
  const onCancel = vi.fn();
  const { slider, onChange } = mountOpacity({ value: 99.2, fractional: true, onPreview, onCancel });
  const press = (key: string, type = 'keydown') =>
    act(() => slider.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true })));
  act(() => slider.focus());
  press('ArrowRight');
  expect(onPreview).toHaveBeenLastCalledWith(100);
  expect(slider.getAttribute('aria-valuetext')).toBe('100%');
  expect(onChange).not.toHaveBeenCalled();
  press('Escape');
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(slider.getAttribute('aria-valuetext')).toBe('99.2%');
  press('ArrowLeft');
  expect(onPreview).toHaveBeenLastCalledWith(99);
  press('ArrowLeft', 'keyup');
  expect(onChange).toHaveBeenCalledExactlyOnceWith(99);

  act(() => slider.dispatchEvent(createPointerEvent('pointerdown', { bubbles: true, button: 0 })));
  act(() => setInputValue(slider, '70'));
  expect(onPreview).toHaveBeenLastCalledWith(70);
  expect(onChange).toHaveBeenCalledTimes(1);
  act(() => slider.dispatchEvent(createPointerEvent('pointerup', { bubbles: true })));
  expect(onChange).toHaveBeenLastCalledWith(70);
  expect(onChange).toHaveBeenCalledTimes(2);

  act(() => slider.dispatchEvent(createPointerEvent('pointerdown', { bubbles: true, button: 0 })));
  act(() => setInputValue(slider, '60'));
  act(() => slider.dispatchEvent(createPointerEvent('pointercancel', { bubbles: true })));
  expect(onCancel).toHaveBeenCalledTimes(2);
  expect(onChange).toHaveBeenCalledTimes(2);
});

it('validates exact opacity edits and limits wheel stepping to Alt on the focused field', () => {
  const { host, onChange } = mountOpacity();
  const edit = () =>
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Edit opacity"]')!.click());
  edit();
  const field = host.querySelector<HTMLInputElement>('[role="spinbutton"]')!;
  const surface = field.closest('.compound-field')!;
  const apply = () =>
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Apply"]')!.click());
  const wheel = (altKey: boolean, deltaY: number) => {
    const event = new WheelEvent('wheel', { altKey, deltaY, bubbles: true, cancelable: true });
    act(() => surface.dispatchEvent(event));
    return event.defaultPrevented;
  };
  expect(document.activeElement).toBe(field);
  expect(wheel(false, -100)).toBe(false);
  expect(field.value).toBe('40');
  expect(wheel(true, -100)).toBe(true);
  expect(field.value).toBe('41');
  expect(wheel(true, 100)).toBe(true);
  expect(field.value).toBe('40');
  act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
  expect(field.value).toBe('41');
  act(() => setInputValue(field, '101'));
  apply();
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('Invalid opacity');
  expect(wheel(true, -100)).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
  act(() => setInputValue(field, '49'));
  apply();
  expect(onChange).toHaveBeenCalledExactlyOnceWith(49);
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Edit opacity');

  edit();
  const draft = host.querySelector<HTMLInputElement>('[role="spinbutton"]')!;
  act(() => setInputValue(draft, '52'));
  act(() => draft.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('[role="spinbutton"]')).toBeNull();
  expect(onChange).toHaveBeenCalledTimes(1);
});

it('discards native opacity input from a canceled hold until the next gesture', () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onChange = vi.fn();
  const onPreview = vi.fn();
  const onCancel = vi.fn();
  act(() =>
    root?.render(
      <OpacityField
        label="Opacity"
        copy={{ apply: 'Apply', editOpacity: 'Edit opacity', invalid: () => 'Invalid' }}
        value={72}
        max={100}
        onChange={onChange}
        onPreview={onPreview}
        onCancel={onCancel}
      />
    )
  );
  const field = container.querySelector<HTMLInputElement>('input[type="range"]')!;
  const pointer = (type: string) =>
    act(() =>
      field.dispatchEvent(
        createPointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse' })
      )
    );
  pointer('pointerdown');
  act(() => setInputValue(field, '55'));
  expect(onPreview).toHaveBeenLastCalledWith(55);
  act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  act(() => setInputValue(field, '30'));
  pointer('pointerup');
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onChange).not.toHaveBeenCalled();
  expect(field.value).toBe('72');
  pointer('pointerdown');
  act(() => setInputValue(field, '60'));
  pointer('pointerup');
  expect(onChange).toHaveBeenCalledExactlyOnceWith(60);
});

it('restores the starting value when the inspector echoes a range preview', () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onCommitValue = vi.fn();
  function ControlledRow() {
    const [value, setValue] = useState(72);
    return (
      <NumericRow
        appearance="plain"
        label="Opacity"
        value={value}
        unit="%"
        scrub={{ min: 0, max: 100, step: 1 }}
        rangePresentation="field"
        onPreviewValue={setValue}
        onCancelValue={(origin) => setValue(origin ?? value)}
        onCommitValue={onCommitValue}
      />
    );
  }
  act(() => root?.render(<ControlledRow />));
  const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
  act(() => slider.dispatchEvent(createPointerEvent('pointerdown', { bubbles: true })));
  act(() => setInputValue(slider, '55'));
  expect(slider.value).toBe('55');
  act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(slider.value).toBe('72');
  expect(onCommitValue).not.toHaveBeenCalled();
});

it('keeps the inline scale unit, nonzero minimum and separate exact-entry step', () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const onCommitValue = vi.fn();
  act(() =>
    root?.render(
      <NumericRow
        appearance="plain"
        label="Scale"
        value={1.5}
        unit="x"
        min={1}
        max={4}
        step={0.1}
        scrub={{ min: 1, max: 4, step: 0.05 }}
        rangePresentation="field"
        onPreviewValue={() => undefined}
        onCommitValue={onCommitValue}
      />
    )
  );
  const slider = container.querySelector<HTMLInputElement>('input[type="range"]')!;
  expect(slider.min).toBe('1');
  expect(slider.max).toBe('4');
  expect(slider.getAttribute('aria-valuetext')).toBe('1.5 x');
  act(() =>
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  );
  act(() => slider.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true })));
  expect(onCommitValue).toHaveBeenLastCalledWith(1.55);
  for (const [key, expected] of [
    ['PageUp', 2],
    ['PageDown', 1],
  ] as const) {
    act(() => slider.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
    act(() => slider.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true })));
    expect(onCommitValue).toHaveBeenLastCalledWith(expected);
  }
  act(() => container?.querySelector<HTMLButtonElement>('button.field-action')?.click());
  const field = container.querySelector<HTMLInputElement>('[role="spinbutton"]')!;
  expect(field.getAttribute('aria-valuemin')).toBe('1');
  act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
  expect(field.value).toBe('1.6');
});

it('steps from the accepted value even when the pencil shows a rounded number', () => {
  const { host, onChange } = mountOpacity({
    value: 1.234,
    unit: 'x',
    min: 1,
    max: 4,
    step: 0.1,
    precision: 2,
    fractional: true,
  });
  act(() => host.querySelector<HTMLButtonElement>('button.field-action')!.click());
  const draft = host.querySelector<HTMLInputElement>('[role="spinbutton"]')!;
  expect(draft.value).toBe('1.23');
  act(() => draft.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
  expect(draft.value).toBe('1.33');
  act(() => draft.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(onChange).toHaveBeenCalledExactlyOnceWith(1.334);
});

it('distinguishes an untouched pencil draft from explicitly entering its rounded text', () => {
  const { host, onChange } = mountOpacity({ value: 1.234, fractional: true, precision: 2 });
  const open = () => {
    act(() => host.querySelector<HTMLButtonElement>('button.field-action')!.click());
    return host.querySelector<HTMLInputElement>('[role="spinbutton"]')!;
  };
  const accept = (field: HTMLInputElement) =>
    act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  accept(open());
  expect(onChange).not.toHaveBeenCalled();
  const field = open();
  act(() => setInputValue(field, ''));
  act(() => setInputValue(field, '1.23'));
  accept(field);
  expect(onChange).toHaveBeenCalledExactlyOnceWith(1.23);
});

it('treats replacement of selected text with the same visible digit as an edit', () => {
  const { host, onChange } = mountOpacity({ value: 1.004, fractional: true, precision: 2 });
  act(() => host.querySelector<HTMLButtonElement>('button.field-action')!.click());
  const field = host.querySelector<HTMLInputElement>('[role="spinbutton"]')!;
  expect(field.value).toBe('1');
  act(() => setInputValue(field, '1'));
  act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(onChange).toHaveBeenCalledExactlyOnceWith(1);
});

it.each([
  [3.95, 'ArrowUp', '4'],
  [1.05, 'ArrowDown', '1'],
] as const)('reaches the pencil endpoint from an off-step value %s', (value, key, endpoint) => {
  const { host, onChange } = mountOpacity({
    value,
    min: 1,
    max: 4,
    step: 0.1,
    fractional: true,
  });
  act(() => host.querySelector<HTMLButtonElement>('button.field-action')!.click());
  const field = host.querySelector<HTMLInputElement>('[role="spinbutton"]')!;
  act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
  expect(field.value).toBe(endpoint);
  act(() => field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(onChange).toHaveBeenCalledExactlyOnceWith(Number(endpoint));
});
