// @vitest-environment jsdom
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InspectorLayout, InspectorParameterRow, InspectorSurface } from './layout';
import { CheckboxField, ColorField, SelectField, ToggleField, SegmentedRow } from './controls';
import { TextField } from './text-field';
import { NumericRow } from './numeric';
import { TextareaField } from './textarea-field';
import { StatusRow } from './row-controls';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('owns canonical inspector styling and switches focus paint without replacing native focus', () => {
  act(() =>
    root.render(
      <InspectorSurface aria-label="Cursor settings">
        <ToggleField label="Enabled" value={false} onChange={vi.fn()} />
      </InspectorSurface>
    )
  );
  const surface = host.querySelector<HTMLElement>('.sniptale-inspector-surface')!;
  const button = surface.querySelector<HTMLButtonElement>('button')!;
  expect(surface.classList.contains('sniptale-compact-workspace')).toBe(true);
  expect(surface.dataset['focusModality']).toBe('pointer');
  act(() => button.focus());
  act(() => button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
  expect(surface.dataset['focusModality']).toBe('keyboard');
  act(() => button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(surface.dataset['focusModality']).toBe('pointer');
  expect(document.activeElement).toBe(button);
  expect(surface.querySelector('.sniptale-parameter-row')).not.toBeNull();
});

it('keeps color names and padding inert while its value edits and selects all text', () => {
  const change = vi.fn();
  const render = (disabled = false) =>
    act(() =>
      root.render(
        <InspectorLayout>
          <ColorField
            label="Shadow color"
            title="Shadow color"
            value="#112233ff"
            disabled={disabled}
            onChange={change}
          />
        </InspectorLayout>
      )
    );
  render();
  const row = host.querySelector<HTMLElement>('.sniptale-parameter-row')!;
  const label = row.querySelector<HTMLElement>('.sniptale-parameter-name')!;
  act(() => label.click());
  expect(host.querySelector('input')).toBeNull();
  act(() => row.click());
  expect(host.querySelector('input')).toBeNull();
  act(() =>
    row
      .querySelector<HTMLButtonElement>('[data-ui="shared.ui.color-selector.value-trigger"]')!
      .click()
  );
  const input = host.querySelector<HTMLInputElement>('input')!;
  expect(input).not.toBeNull();
  expect(document.activeElement).toBe(input);
  expect(input.selectionEnd! - input.selectionStart!).toBe(input.value.length);
  expect(
    host.querySelector('[data-ui="shared.ui.color-selector"]')?.getAttribute('data-open')
  ).toBe('false');
  act(() => label.click());
  expect(host.querySelector('input')).toBe(input);
  expect(document.activeElement).toBe(input);
  act(() => row.click());
  expect(host.querySelector('input')).toBe(input);
  expect(document.activeElement).toBe(input);
  act(() => input.blur());
  expect(host.querySelector('input')).toBeNull();
  act(() =>
    row
      .querySelector<HTMLButtonElement>('[data-ui="shared.ui.color-selector.value-trigger"]')!
      .click()
  );
  const next = host.querySelector<HTMLInputElement>('input')!;
  expect(document.activeElement).toBe(next);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      next,
      'invalid'
    );
    next.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => next.blur());
  expect(host.querySelector('input')).toBe(next);
  expect(next.value).toBe('invalid');
  expect(next.getAttribute('aria-invalid')).toBe('true');
  act(() => next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('input')).toBeNull();
  expect(change).not.toHaveBeenCalled();
  render(true);
  act(() => label.click());
  act(() => row.click());
  expect(host.querySelector('input')).toBeNull();
  expect(change).not.toHaveBeenCalled();
});

it('keeps choice names and padding inert while its trigger opens and closes', () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <InspectorLayout>
        <SelectField
          label="Aspect ratio"
          value="wide"
          options={[
            { value: 'wide', label: 'Wide' },
            { value: 'square', label: 'Square' },
          ]}
          onChange={change}
        />
      </InspectorLayout>
    )
  );
  const row = host.querySelector<HTMLElement>('.sniptale-parameter-row')!;
  const label = row.querySelector<HTMLElement>('.sniptale-parameter-name')!;
  const trigger = row.querySelector<HTMLButtonElement>('button')!;
  act(() => label.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  act(() => row.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  act(() => trigger.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  act(() => label.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  act(() => label.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  act(() => row.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  act(() => trigger.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  act(() => trigger.click());
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(change).not.toHaveBeenCalled();
});

it('clears a controlled draft without accepting it and keeps input focus', () => {
  const commit = vi.fn();
  function Draft() {
    const [value, setValue] = useState('Scene');
    return (
      <InspectorLayout>
        <TextField
          label="Title"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          onValueCommit={commit}
        />
      </InspectorLayout>
    );
  }
  act(() => root.render(<Draft />));
  const input = host.querySelector<HTMLInputElement>('input')!;
  const clear = host.querySelector<HTMLButtonElement>('.sniptale-field-clear')!;
  act(() => input.focus());
  act(() => clear.click());
  expect(input.value).toBe('');
  expect(document.activeElement).toBe(input);
  expect(host.querySelector('.sniptale-field-clear')).toBeNull();
  expect(commit).not.toHaveBeenCalled();
  act(() => input.blur());
  expect(commit).toHaveBeenCalledExactlyOnceWith('');
});

it('keeps text names and padding inert while the input retains native focus', () => {
  act(() =>
    root.render(
      <InspectorLayout>
        <TextField label="Title" defaultValue="Scene" />
      </InspectorLayout>
    )
  );
  const input = host.querySelector<HTMLInputElement>('input')!;
  const label = host.querySelector<HTMLElement>('.sniptale-parameter-name')!;
  const row = host.querySelector<HTMLElement>('.sniptale-parameter-row')!;
  act(() => label.click());
  expect(document.activeElement).not.toBe(input);
  act(() => row.click());
  expect(document.activeElement).not.toBe(input);
  act(() => input.focus());
  expect(document.activeElement).toBe(input);
  act(() => label.click());
  expect(document.activeElement).toBe(input);
  act(() => row.click());
  expect(document.activeElement).toBe(input);
});

it('keeps unavailable and read-only values without clear actions', () => {
  act(() =>
    root.render(
      <InspectorLayout>
        <TextField label="Identity" value="source-1" readOnly />
        <TextField label="Suffix" value="final" disabled />
        <SelectField
          label="Preset"
          value="wide"
          disabled
          options={[{ value: 'wide', label: 'Wide' }]}
          onChange={vi.fn()}
        />
      </InspectorLayout>
    )
  );
  expect(host.querySelector('.sniptale-field-clear')).toBeNull();
  const row = host.querySelector<HTMLElement>(
    '[data-ui="shared.ui.compact-inspector.select-field"]'
  )!;
  act(() => row.click());
  expect(row.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
});

it('retains native disabled-fieldset behavior for whole-row boolean activation', () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <InspectorLayout>
        <fieldset disabled>
          <ToggleField label="Fade audio" value onChange={change} />
        </fieldset>
      </InspectorLayout>
    )
  );
  act(() => host.querySelector<HTMLElement>('.sniptale-parameter-name')!.click());
  expect(change).not.toHaveBeenCalled();
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
});

it('clears an uncontrolled draft without restoring its initial value on rerender', () => {
  act(() =>
    root.render(
      <InspectorLayout>
        <TextField label="Title" defaultValue="Scene" />
      </InspectorLayout>
    )
  );
  const input = host.querySelector<HTMLInputElement>('input')!;
  act(() => host.querySelector<HTMLButtonElement>('.sniptale-field-clear')!.click());
  expect(input.value).toBe('');
  expect(host.querySelector('.sniptale-field-clear')).toBeNull();
  expect(document.activeElement).toBe(input);
});

it('keeps numeric names and padding inert and accepts its draft once on blur', () => {
  const commit = vi.fn();
  act(() =>
    root.render(
      <InspectorLayout>
        <NumericRow
          appearance="plain"
          label="Opacity"
          value={10}
          min={0}
          max={100}
          onPreviewValue={vi.fn()}
          onCommitValue={commit}
        />
      </InspectorLayout>
    )
  );
  const label = host.querySelector<HTMLElement>('.sniptale-parameter-name')!;
  const input = host.querySelector<HTMLInputElement>('input[type=text]')!;
  const row = host.querySelector<HTMLElement>('.sniptale-parameter-row')!;
  act(() => label.click());
  expect(document.activeElement).not.toBe(input);
  act(() => row.click());
  expect(document.activeElement).not.toBe(input);
  act(() => input.focus());
  expect(document.activeElement).toBe(input);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '15');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => label.click());
  expect(document.activeElement).toBe(input);
  act(() => row.click());
  expect(document.activeElement).toBe(input);
  expect(commit).not.toHaveBeenCalled();
  act(() => input.blur());
  expect(document.activeElement).not.toBe(input);
  expect(commit).toHaveBeenCalledExactlyOnceWith(15);
  act(() => input.focus());
  expect(document.activeElement).toBe(input);
});

it('clears multiline drafts through their existing change path without committing', () => {
  const blur = vi.fn();
  function Draft() {
    const [value, setValue] = useState('A long\nmultiline draft');
    return (
      <InspectorLayout>
        <TextareaField label="Description" value={value} onChange={setValue} onBlur={blur} />
      </InspectorLayout>
    );
  }
  act(() => root.render(<Draft />));
  const input = host.querySelector<HTMLTextAreaElement>('textarea')!;
  act(() => host.querySelector<HTMLElement>('.sniptale-parameter-name')!.click());
  expect(document.activeElement).not.toBe(input);
  act(() => host.querySelector<HTMLElement>('.sniptale-parameter-row')!.click());
  expect(document.activeElement).not.toBe(input);
  act(() => input.focus());
  expect(document.activeElement).toBe(input);
  act(() => host.querySelector<HTMLElement>('.sniptale-parameter-name')!.click());
  expect(document.activeElement).toBe(input);
  act(() => host.querySelector<HTMLButtonElement>('.sniptale-field-clear')!.click());
  expect(input.value).toBe('');
  expect(document.activeElement).toBe(input);
  expect(blur).not.toHaveBeenCalled();
  expect(host.querySelector('.sniptale-field-clear')).toBeNull();
});

it('represents mixed boolean values and applies one value through the existing owner', () => {
  const change = vi.fn();
  function MixedValue() {
    const [value, setValue] = useState<boolean | undefined>(undefined);
    return (
      <InspectorLayout>
        <CheckboxField
          label="Action sound"
          value={value === true}
          indeterminate={value === undefined}
          onChange={(checked) => {
            change(checked);
            setValue(checked);
          }}
        />
      </InspectorLayout>
    );
  }
  act(() => root.render(<MixedValue />));
  const input = host.querySelector<HTMLInputElement>('input')!;
  expect(input.indeterminate).toBe(true);
  act(() => host.querySelector<HTMLElement>('.sniptale-parameter-name')!.click());
  expect(change).toHaveBeenCalledExactlyOnceWith(true);
  expect(input.checked).toBe(true);
  expect(input.indeterminate).toBe(false);
  act(() => input.click());
  expect(change).toHaveBeenLastCalledWith(false);
  expect(input.checked).toBe(false);
});

it('retains an unaccepted mixed value after checkbox activation', () => {
  const change = vi.fn();
  act(() =>
    root.render(
      <CheckboxField label="Action sound" value={false} indeterminate onChange={change} />
    )
  );
  const input = host.querySelector<HTMLInputElement>('input')!;
  act(() => input.click());
  expect(change).toHaveBeenCalledExactlyOnceWith(true);
  expect(input.checked).toBe(false);
  expect(input.indeterminate).toBe(true);
});

it('activates an adaptive dropdown only through its actual trigger', () => {
  const activate = vi.fn();
  act(() =>
    root.render(
      <InspectorLayout>
        <InspectorParameterRow label="Background">
          <button aria-haspopup="listbox" onClick={activate}>
            None
          </button>
        </InspectorParameterRow>
      </InspectorLayout>
    )
  );
  act(() => host.querySelector<HTMLElement>('.sniptale-parameter-name')!.click());
  expect(activate).not.toHaveBeenCalled();
  act(() => host.querySelector<HTMLElement>('.sniptale-parameter-row')!.click());
  expect(activate).not.toHaveBeenCalled();
  act(() => host.querySelector('button')!.click());
  expect(activate).toHaveBeenCalledTimes(1);
});

it('cancels a held clear command without changing or accepting its draft', () => {
  const change = vi.fn();
  const commit = vi.fn();
  act(() =>
    root.render(
      <CommandPressScope.Provider value={true}>
        <InspectorLayout>
          <TextField label="Title" value="Scene" onChange={change} onValueCommit={commit} />
        </InspectorLayout>
      </CommandPressScope.Provider>
    )
  );
  const clear = host.querySelector<HTMLButtonElement>('.sniptale-field-clear')!;
  act(() => clear.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 })));
  expect(clear.dataset['pressing']).toBe('true');
  expect(change).not.toHaveBeenCalled();
  act(() => clear.dispatchEvent(new Event('pointercancel', { bubbles: true })));
  expect(clear.dataset['pressing']).toBeUndefined();
  act(() => clear.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
  expect(change).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLInputElement>('input')!.value).toBe('Scene');
});

it('presents a scoped static value without an editable or disabled control', () => {
  const value = 'A long selected object name that must remain available';
  act(() =>
    root.render(
      <InspectorLayout>
        <StatusRow label="Selected object" value={value} />
      </InspectorLayout>
    )
  );
  const row = host.querySelector('[data-ui="shared.ui.compact-inspector.status-row"]');
  expect(row?.textContent).toBe(`Selected object${value}`);
  expect(row?.querySelector('[title]')?.textContent).toBe('Selected object');
  expect(row?.querySelector('.sniptale-parameter-value')?.textContent).toBe(value);
  expect(row?.querySelector('input,textarea,button,[aria-disabled]')).toBeNull();
});

it('defers a blurred row resize until the command press ends', async () => {
  let width = 140;
  let held = false;
  let frame: FrameRequestCallback | undefined;
  const query = document.querySelector.bind(document);
  const selector = vi
    .spyOn(document, 'querySelector')
    .mockImplementation((value) =>
      value === ':active' ? (held ? document.body : null) : query(value)
    );
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  const metric = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(() => width);
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  // The layout owner needs only font assignment and text advance from this browser boundary.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => ({ font: '', measureText: (text: string) => ({ width: text.length * 8 }) }),
  });
  try {
    act(() =>
      root.render(
        <>
          <InspectorParameterRow label="Title">
            <input />
          </InspectorParameterRow>
          <button>None</button>
        </>
      )
    );
    const row = host.querySelector<HTMLElement>('.sniptale-parameter-row')!;
    const input = host.querySelector('input')!;
    expect(row.dataset['layout']).toBe('stacked');
    act(() => input.focus());
    width = 500;
    held = true;
    await act(async () => {
      host.querySelector('button')!.focus();
      await Promise.resolve();
    });
    expect(row.dataset['layout']).toBe('stacked');
    expect(frame).toBeDefined();
    act(() => frame!(0));
    expect(row.dataset['layout']).toBe('stacked');
    held = false;
    act(() => frame!(1));
    expect(row.dataset['layout']).toBe('inline');
  } finally {
    canvas.mockRestore();
    metric.mockRestore();
    selector.mockRestore();
    request.mockRestore();
    cancel.mockRestore();
  }
});

it('changes segments to a dropdown when enlarged label metrics no longer fit', () => {
  let size = 13;
  const listeners: Array<() => void> = [];
  const observed: Element[] = [];
  const metric = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(240);
  const computedStyle = window.getComputedStyle.bind(window);
  const style = vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const current = computedStyle(element);
    Object.defineProperties(current, {
      fontSize: { configurable: true, value: `${size}px` },
      fontFamily: { configurable: true, value: 'sans-serif' },
    });
    return current;
  });
  const context = {
    font: '',
    measureText: (text: string) => ({
      width: text.length * Number.parseFloat(context.font.split(' ')[1]!) * 0.5,
    }),
  };
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => context,
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        listeners.push(callback);
      }
      observe(element: Element) {
        observed.push(element);
      }
      disconnect() {}
    }
  );
  try {
    act(() =>
      root.render(
        <InspectorLayout>
          <SegmentedRow
            ariaLabel="Context"
            columns={2}
            value="phrase"
            onChange={vi.fn()}
            options={[
              { value: 'phrase', label: 'Each phrase' },
              { value: 'script', label: 'Whole script' },
            ]}
          />
        </InspectorLayout>
      )
    );
    expect(host.querySelector('[role="group"]')).not.toBeNull();
    size = 20;
    act(() => listeners.forEach((notify) => notify()));
    expect(host.querySelector('[role="group"]')).toBeNull();
    expect(host.querySelector('button[aria-label="Context"]')).not.toBeNull();
    expect(
      observed.some((element) => element.matches('.sniptale-property-segments > button'))
    ).toBe(true);
  } finally {
    canvas.mockRestore();
    style.mockRestore();
    metric.mockRestore();
  }
});
