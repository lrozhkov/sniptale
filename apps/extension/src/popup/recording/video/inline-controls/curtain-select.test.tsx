// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InlineCurtainSelect } from './curtain-select';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderSelect(onChange = vi.fn(), value = 'b') {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <InlineCurtainSelect
        ariaLabel="Device"
        label="Mic"
        onChange={onChange}
        options={[
          { value: 'a', label: 'Default input device with a long name' },
          {
            value: 'b',
            label: 'Studio microphone with a long name',
            description: 'Full device path',
          },
        ]}
        value={value}
      />
    );
  });
}

function renderSelectWithSecondaryAction() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <InlineCurtainSelect
        ariaLabel="Device"
        label="Cam"
        onChange={vi.fn()}
        options={[{ value: 'camera-1', label: 'Camera 1' }]}
        secondaryAction={{
          ariaLabel: 'Open settings',
          label: 'Settings',
          panel: <div>Camera settings panel</div>,
        }}
        value="camera-1"
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 100,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get() {
      return this.textContent?.includes('Studio microphone') ? 160 : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    value: 20,
  });
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const isPanel = this.id !== '';
    return {
      bottom: isPanel ? 100 : 180,
      height: isPanel ? 100 : 40,
      left: 0,
      right: 100,
      top: isPanel ? 0 : 140,
      width: 100,
      x: 0,
      y: isPanel ? 0 : 140,
      toJSON: () => ({}),
    };
  };
});

it('anchors the option list near the trigger when the active value is missing', () => {
  renderSelect(vi.fn(), 'missing-device');

  act(() => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
  });

  const list = container?.querySelector('[id] div[style]');
  expect(list?.getAttribute('style')).toContain('padding-top: 60px');
});

it('anchors the active option near the pointer position used to open the curtain', () => {
  renderSelect();

  act(() => {
    const button = container?.querySelector<HTMLButtonElement>('button');
    button?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 210 }));
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  });

  const panel = container?.querySelector<HTMLElement>('[id]');
  const list = container?.querySelector('[id] div[style]');
  expect(panel?.scrollTop).toBe(0);
  expect(list?.getAttribute('style')).toContain('padding-top: 40px');
});

it('uses free space above the list before scrolling lower-row triggers', () => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: 400,
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get() {
      return this.textContent?.includes('Studio microphone') ? 160 : 100;
    },
  });
  renderSelect();

  act(() => {
    const button = container?.querySelector<HTMLButtonElement>('button');
    button?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 360 }));
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  });

  const panel = container?.querySelector<HTMLElement>('[id]');
  const list = container?.querySelector('[id] div[style]');
  expect(panel?.scrollTop).toBe(0);
  expect(list?.getAttribute('style')).toContain('padding-top: 290px');
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('opens a full-height curtain, titles truncated text, centers the active option, and closes outside', () => {
  renderSelect();

  act(() => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
  });

  const panel = container?.querySelector<HTMLElement>('[id]');
  expect(panel?.scrollTop).toBe(10);
  expect(panel?.className).toContain('absolute inset-y-0');
  expect(container?.querySelector('[title="Studio microphone with a long name"]')).not.toBeNull();
  expect(container?.querySelector('[title="Full device path"]')).not.toBeNull();
  expect(container?.querySelector('[aria-current="true"]')?.className).toContain(
    'var(--sniptale-color-accent)'
  );

  act(() => {
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });

  expect(container?.querySelector('[id]')).toBeNull();
});

it('opens the secondary curtain panel and closes it from the panel close button', () => {
  renderSelectWithSecondaryAction();

  act(() => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent?.includes('Settings'))
      ?.click();
  });

  expect(container?.textContent).toContain('Camera settings panel');

  act(() => {
    container?.querySelector<HTMLButtonElement>('[aria-label="Закрыть"]')?.click();
  });

  expect(container?.textContent).not.toContain('Camera settings panel');
});
