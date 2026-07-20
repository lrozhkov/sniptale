// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../glass-select/overlay-state', () => ({
  useGlassSelectOverlay: () => ({
    menuPosition: 'bottom' as const,
  }),
}));

import { useProductSelectController } from './controller';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderElement(element: React.ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(element);
  });
}

function dispatchKeydown(target: Element | null | undefined, key: string) {
  act(() => {
    target?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
  });
}

function clickElement(target: Element | null | undefined) {
  act(() => {
    target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
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

function HookHarness(props: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: Array<{ disabled?: boolean; label: string; value: string }>;
  value: string;
}) {
  const select = useProductSelectController({
    disabled: props.disabled ?? false,
    onChange: props.onChange,
    options: props.options,
    value: props.value,
  });

  return (
    <div ref={select.containerRef}>
      <button
        ref={select.setTriggerRef}
        onClick={select.handleToggle}
        onKeyDown={select.handleTriggerKeyDown}
      >
        trigger
      </button>
      {props.options.map((option, index) => (
        <button
          key={option.value}
          ref={(node) => {
            select.optionRefs.current[index] = node;
          }}
          onClick={() => select.handleSelect(option)}
          onKeyDown={select.handleOptionKeyDown(index)}
        >
          {option.label}
        </button>
      ))}
      <output data-open={String(select.isOpen)} data-active={String(select.activeIndex)}>
        {select.selectedOption?.value ?? ''}
      </output>
    </div>
  );
}

function renderSelectGuardHarness(onChange: (value: string) => void) {
  renderElement(
    <div>
      <HookHarness
        disabled
        value=""
        onChange={onChange}
        options={[{ value: 'one', label: 'One' }]}
      />
      <HookHarness
        value=""
        onChange={onChange}
        options={[
          { value: 'one', label: 'One' },
          { value: 'two', label: 'Two' },
        ]}
      />
    </div>
  );

  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  return {
    activeTrigger: buttons[2],
    disabledTrigger: buttons[0],
    firstOption: buttons[3],
    secondOption: buttons[4],
  };
}

it('opens to the first enabled option and focuses it on downward navigation', () => {
  renderElement(
    <HookHarness
      value=""
      onChange={() => undefined}
      options={[
        { value: 'one', label: 'One', disabled: true },
        { value: 'two', label: 'Two' },
      ]}
    />
  );

  const [trigger, disabledOption, enabledOption] = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  );

  trigger?.focus();
  dispatchKeydown(trigger, 'ArrowDown');

  expect(document.activeElement).toBe(enabledOption);
  expect(container?.querySelector('output')?.getAttribute('data-open')).toBe('true');
  expect(container?.querySelector('output')?.getAttribute('data-active')).toBe('1');

  act(() => {
    disabledOption?.click();
  });

  expect(container?.querySelector('output')?.getAttribute('data-open')).toBe('true');
});

it('supports close-without-restore, close-with-restore, and disabled toggle guards', async () => {
  const onChange = vi.fn();

  const { activeTrigger, disabledTrigger, firstOption, secondOption } =
    renderSelectGuardHarness(onChange);

  clickElement(disabledTrigger);
  expect(container?.querySelectorAll('output')[0]?.getAttribute('data-open')).toBe('false');

  activeTrigger?.focus();
  dispatchKeydown(activeTrigger, 'ArrowUp');
  expect(document.activeElement).toBe(secondOption);

  dispatchKeydown(secondOption, 'Tab');
  await flushMicrotasks();
  expect(container?.querySelectorAll('output')[1]?.getAttribute('data-open')).toBe('false');
  expect(document.activeElement).not.toBe(activeTrigger);

  dispatchKeydown(activeTrigger, 'ArrowDown');
  dispatchKeydown(firstOption, 'Escape');
  await flushMicrotasks();
  expect(document.activeElement).toBe(activeTrigger);

  dispatchKeydown(activeTrigger, 'ArrowDown');
  clickElement(secondOption);
  await flushMicrotasks();
  expect(onChange).toHaveBeenCalledWith('two');
  expect(document.activeElement).toBe(activeTrigger);
});
