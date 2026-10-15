// @vitest-environment jsdom
import { act, createRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommandPressScope, useCommandPress } from './press';
import { ProductActionButton } from '../product-modal/actions';
import { ProductModalHeader } from '../product-modal';
import { ContentToolbarButton } from '../content-toolbar';
import { ProductGlassSwitch } from '../product-glass-controls/buttons';

let host: HTMLDivElement;
let root: Root;
const command = vi.fn();
function Command({ disabled = false }: { disabled?: boolean }) {
  const press = useCommandPress({ disabled, onClick: command });
  return (
    <button disabled={disabled} data-pressing={press.pressed} {...press.props}>
      Run
    </button>
  );
}
function pointer(type: string, target: EventTarget, buttons = 1) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => target.dispatchEvent(event));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  command.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Command />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it('shows pressure before activation and restores pressure on held reentry', () => {
  const button = host.querySelector('button')!;
  pointer('pointerdown', button);
  expect(button.dataset['pressing']).toBe('true');
  expect(command).not.toHaveBeenCalled();
  pointer('pointerout', button);
  expect(button.dataset['pressing']).toBe('false');
  pointer('pointerover', button);
  expect(button.dataset['pressing']).toBe('true');
  pointer('pointerup', button, 0);
  expect(button.dataset['pressing']).toBe('false');
  act(() => button.click());
  expect(command).toHaveBeenCalledTimes(1);
});
it.each(['pointercancel', 'lostpointercapture', 'blur'])(
  'cancels pressure on %s and rejects the canceled pointer tail',
  (type) => {
    const button = host.querySelector('button')!;
    pointer('pointerdown', button);
    if (type === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    else pointer(type, button);
    expect(button.dataset['pressing']).toBe('false');
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    expect(command).not.toHaveBeenCalled();
    pointer('pointerdown', button);
    pointer('pointerup', button, 0);
    act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
    expect(command).toHaveBeenCalledTimes(1);
  }
);
it('cancels Space with Escape and prevents repeated Enter activation', () => {
  const button = host.querySelector('button')!;
  const key = (type: string, key: string, repeat = false) => {
    const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, key, repeat });
    act(() => button.dispatchEvent(event));
    return event;
  };
  key('keydown', ' ');
  expect(button.dataset['pressing']).toBe('true');
  expect(key('keydown', 'Escape').defaultPrevented).toBe(true);
  expect(button.dataset['pressing']).toBe('false');
  expect(key('keyup', ' ').defaultPrevented).toBe(true);
  key('keydown', 'Enter');
  expect(key('keydown', 'Enter', true).defaultPrevented).toBe(true);
  key('keyup', 'Enter');
  expect(command).not.toHaveBeenCalled();
});
it('clears an active press when disabled and removes interruption listeners on unmount', () => {
  const button = host.querySelector('button')!;
  pointer('pointerdown', button);
  act(() => root.render(<Command disabled />));
  expect(button.dataset['pressing']).toBe('false');
  act(() => button.click());
  expect(command).not.toHaveBeenCalled();
  act(() => root.render(<Command />));
  pointer('pointerdown', button);
  act(() => root.render(null));
  act(() => window.dispatchEvent(new Event('blur')));
  expect(command).not.toHaveBeenCalled();
});

it('does not arm a command disabled by its native fieldset', () => {
  act(() =>
    root.render(
      <fieldset disabled>
        <Command />
      </fieldset>
    )
  );
  const button = host.querySelector('button')!;
  pointer('pointerdown', button);
  expect(button.dataset['pressing']).toBe('false');
  act(() => button.click());
  expect(command).not.toHaveBeenCalled();
});

const scopedControls = [
  ['modal action', () => <ProductActionButton onClick={command}>Run</ProductActionButton>, true],
  [
    'toolbar utility',
    () => (
      <ContentToolbarButton onClick={command} tone="utility">
        Run
      </ContentToolbarButton>
    ),
    true,
  ],
  ['modal close', () => <ProductModalHeader title="Dialog" onClose={command} />, true],
  [
    'switch',
    () => <ProductGlassSwitch onClick={command} role="switch" aria-checked={false} />,
    false,
  ],
] as const;

it.each(scopedControls)(
  'keeps %s native by default and adopts the press cycle through a portal',
  (_name, control, wrapped) => {
    act(() => root.render(control()));
    const unscoped = host.querySelector('button')!;
    expect(unscoped.hasAttribute('data-command-press')).toBe(false);
    expect(unscoped.querySelector('.sniptale-command-content')).toBeNull();
    const nativeRepeat = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      repeat: true,
    });
    act(() => unscoped.dispatchEvent(nativeRepeat));
    expect(nativeRepeat.defaultPrevented).toBe(false);
    pointer('pointerdown', unscoped);
    expect(unscoped.hasAttribute('data-pressing')).toBe(false);

    const portal = document.createElement('div');
    document.body.append(portal);
    try {
      act(() =>
        root.render(
          <CommandPressScope.Provider value={true}>
            {createPortal(control(), portal)}
          </CommandPressScope.Provider>
        )
      );
      const button = portal.querySelector('button')!;
      expect(button.hasAttribute('data-command-press')).toBe(true);
      expect(Boolean(button.querySelector('.sniptale-command-content'))).toBe(wrapped);
      pointer('pointerdown', button);
      expect(button.dataset['pressing']).toBe('true');
      expect(command).not.toHaveBeenCalled();
      pointer('pointerup', button, 0);
      act(() => button.click());
      expect(command).toHaveBeenCalledTimes(1);
      const repeat = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        repeat: true,
      });
      act(() => button.dispatchEvent(repeat));
      expect(repeat.defaultPrevented).toBe(true);
      act(() => button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' })));
      expect(button.dataset['pressing']).toBe('true');
      act(() =>
        button.dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
        )
      );
      const release = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: ' ' });
      act(() => button.dispatchEvent(release));
      expect(release.defaultPrevented).toBe(true);
      expect(button.hasAttribute('data-pressing')).toBe(false);
      expect(command).toHaveBeenCalledTimes(1);
    } finally {
      act(() => root.render(null));
      portal.remove();
    }
  }
);

it('preserves toolbar refs, native submit type and caller pointer handlers', () => {
  const ref = createRef<HTMLButtonElement>();
  const pointerDown = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
  act(() =>
    root.render(
      <CommandPressScope.Provider value={true}>
        <ContentToolbarButton ref={ref} type="submit" onPointerDown={pointerDown} onClick={command}>
          Submit
        </ContentToolbarButton>
      </CommandPressScope.Provider>
    )
  );
  const button = host.querySelector('button')!;
  expect(ref.current).toBe(button);
  expect(button.type).toBe('submit');
  pointer('pointerdown', button);
  expect(pointerDown).toHaveBeenCalledTimes(1);
  expect(button.dataset['pressing']).toBe('true');
  pointer('pointerup', button, 0);
  act(() => button.click());
  expect(command).toHaveBeenCalledTimes(1);
});

it('detaches active interruption listeners when the scope is disabled', () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  const scope = (enabled: boolean): ReactNode => (
    <CommandPressScope.Provider value={enabled}>
      <ProductGlassSwitch onClick={command} />
    </CommandPressScope.Provider>
  );
  act(() => root.render(scope(true)));
  const button = host.querySelector('button')!;
  pointer('pointerdown', button);
  expect(button.dataset['pressing']).toBe('true');
  act(() => root.render(scope(false)));
  expect(button.hasAttribute('data-pressing')).toBe(false);
  expect(remove.mock.calls.some(([type]) => type === 'blur')).toBe(true);
  act(() => button.click());
  expect(command).toHaveBeenCalledTimes(1);
  remove.mockRestore();
});
