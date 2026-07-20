// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PopupSelect as PublicPopupSelect } from './index';
import { PopupSelect } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderSelect(props?: Partial<React.ComponentProps<typeof PopupSelect>>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <PopupSelect
        aria-label="Popup select"
        value="screen"
        onChange={() => undefined}
        options={[
          { value: 'screen', label: 'Screen', description: '1365x768' },
          { value: 'microphone', label: 'USB microphone with a long display name' },
        ]}
        {...props}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('merges popup trigger and shell classes while keeping the default data-ui', () => {
  renderSelect({ className: 'custom-trigger', containerClassName: 'custom-shell' });

  const shell = container?.querySelector('[data-ui="shared.ui.popup-select"]');
  const trigger = container?.querySelector('button[aria-haspopup="listbox"]');

  expect(shell?.className).toContain('sniptale-popup-select-shell');
  expect(shell?.className).toContain('custom-shell');
  expect(trigger?.className).toContain('sniptale-popup-select');
  expect(trigger?.className).toContain('custom-trigger');
  expect(trigger?.className).toContain('sniptale-select-sm');
});

it('is available from the shared ui public facade', () => {
  expect(PublicPopupSelect).toBe(PopupSelect);
});

it('passes through custom data-ui, menu classes, and change handling', () => {
  const onChange = vi.fn();
  renderSelect({
    dataUi: 'popup.video.device-select',
    menuClassName: 'custom-menu',
    onChange,
  });

  const trigger = container?.querySelector('button[aria-haspopup="listbox"]');
  act(() => trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

  const menu = container?.querySelector('[role="listbox"]');
  const options = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  );

  expect(container?.querySelector('[data-ui="popup.video.device-select"]')).not.toBeNull();
  expect(menu?.className).toContain('sniptale-popup-select-menu');
  expect(menu?.className).toContain('custom-menu');

  act(() => options[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

  expect(onChange).toHaveBeenCalledWith('microphone');
});
