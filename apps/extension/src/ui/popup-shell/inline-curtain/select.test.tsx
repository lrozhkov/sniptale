// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InlineCurtainSelect } from './select';
import { PopupSelect } from '../select';

function TestOptionIcon({ className }: { className?: string }) {
  return <svg className={className} data-testid="option-icon" />;
}

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
        description="Choose the input used for recording"
        label="Mic"
        onChange={onChange}
        options={[
          { value: 'a', label: 'Default input device with a long name', icon: TestOptionIcon },
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
        description="Choose the camera used for recording"
        label="Cam"
        onChange={vi.fn()}
        options={[{ value: 'camera-1', label: 'Camera 1' }]}
        secondaryAction={{
          ariaLabel: 'Open settings',
          label: 'Settings',
          panel: <div>Camera settings panel</div>,
          panelDescription: 'Adjust camera quality and placement',
          panelTitle: 'Camera settings',
        }}
        value="camera-1"
      />
    );
  });
}

function renderSelectWithCustomOptionsPanel(onFormatChange = vi.fn(), optionsPanel?: ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <InlineCurtainSelect
        ariaLabel="Quality"
        description="Choose image format and quality"
        label="Quality"
        onChange={vi.fn()}
        options={[]}
        optionsPanel={optionsPanel ?? <button onClick={() => onFormatChange('webp')}>WebP</button>}
        selectedLabel="JPEG · 90%"
        value="jpeg"
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

it('keeps the option list top-aligned with manual scrolling and no automatic offset', () => {
  renderSelect(vi.fn(), 'missing-device');

  act(() => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
  });

  const panel = container?.querySelector<HTMLElement>('[id]');
  const list = panel?.querySelector('div[style]');
  expect(panel?.scrollTop).toBe(0);
  expect(panel?.className).toContain('overflow-y-auto');
  expect(list).toBeNull();
});

it('keeps parameter labels in the shared fixed-width column', () => {
  renderSelect();

  const label = container?.querySelector<HTMLElement>('[title="Mic"]');
  expect(label?.className).toContain('w-[88px]');
  expect(label?.className).toContain('truncate');
});

it('keeps the settings action outside the highlighted disclosure target', () => {
  renderSelectWithSecondaryAction();
  const trigger = container?.querySelector<HTMLButtonElement>('button[aria-label="Device"]');
  const settings = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Open settings"]'
  );
  expect(trigger?.querySelector('svg')).not.toBeNull();
  expect(settings?.querySelector('svg')).toBeNull();
  expect(trigger?.className).toContain('hover:bg-');
  expect(trigger?.parentElement?.className).not.toContain('hover:bg-');
  expect(settings?.parentElement).toBe(trigger?.parentElement);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('opens over a theme-aware blurred backdrop and dismisses from the covered area', () => {
  renderSelect();

  act(() => {
    container?.querySelector<HTMLButtonElement>('button')?.click();
  });

  const panel = container?.querySelector<HTMLElement>('[id]');
  const backdrop = container?.querySelector<HTMLButtonElement>(
    '[data-ui="popup.inline-curtain.backdrop"]'
  );
  expect(panel?.scrollTop).toBe(0);
  expect(panel?.className).toContain('absolute inset-y-0');
  expect(panel?.textContent).toContain('Mic');
  expect(panel?.textContent).toContain('Choose the input used for recording');
  expect(panel?.querySelector('[data-ui="popup.inline-curtain.back"]')).not.toBeNull();
  expect(backdrop?.className).toContain('var(--sniptale-color-surface-canvas)');
  expect(backdrop?.className).toContain('backdrop-blur-[4px]');
  expect(container?.querySelector('[title="Studio microphone with a long name"]')).not.toBeNull();
  expect(container?.querySelector('[title="Full device path"]')).not.toBeNull();
  expect(container?.querySelector('[aria-current="true"]')?.className).toContain(
    'var(--sniptale-color-accent)'
  );
  expect(container?.querySelector('[data-testid="option-icon"]')?.getAttribute('class')).toContain(
    'h-4 w-4'
  );

  act(() => backdrop?.click());

  expect(container?.querySelector('[id]')).toBeNull();
  expect(container?.querySelector('[data-ui="popup.inline-curtain.backdrop"]')).toBeNull();
});

it('preserves document-level outside-pointer dismissal', () => {
  renderSelect();
  act(() => container?.querySelector<HTMLButtonElement>('button')?.click());

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
  expect(container?.textContent).toContain('Camera settings');
  expect(container?.textContent).toContain('Adjust camera quality and placement');
  expect(container?.querySelector('[data-ui="popup.inline-curtain.back"]')).toBeNull();

  act(() => {
    container?.querySelector<HTMLButtonElement>('[aria-label="Закрыть"]')?.click();
  });

  expect(container?.textContent).not.toContain('Camera settings panel');
});

it('keeps a custom options curtain open while its controls are changed', () => {
  const onFormatChange = vi.fn();
  renderSelectWithCustomOptionsPanel(onFormatChange);

  act(() => {
    container?.querySelector<HTMLButtonElement>('[aria-label="Quality"]')?.click();
  });
  act(() => {
    Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent === 'WebP')
      ?.click();
  });

  expect(onFormatChange).toHaveBeenCalledWith('webp');
  expect(container?.textContent).toContain('WebP');
  expect(container?.querySelector<HTMLElement>('[id]')).not.toBeNull();
});

it('closes on Escape and restores focus to the trigger', async () => {
  renderSelect();
  const trigger = container?.querySelector<HTMLButtonElement>('[aria-label="Device"]');
  act(() => trigger?.click());
  await act(async () => Promise.resolve());
  expect(container?.querySelector('[role="listbox"]')).not.toBeNull();
  expect(document.activeElement?.getAttribute('data-ui')).toBe('popup.inline-curtain.back');

  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(container?.querySelector('[role="listbox"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it.each(['close button', 'Escape'])(
  'returns focus to the secondary opener after %s',
  async (method) => {
    renderSelectWithSecondaryAction();
    const opener = container?.querySelector<HTMLButtonElement>('[aria-label="Open settings"]');
    act(() => {
      opener?.focus();
      opener?.click();
    });
    await act(async () => Promise.resolve());
    expect(container?.textContent).toContain('Camera settings panel');
    act(() => {
      if (method === 'Escape')
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      else container?.querySelector<HTMLButtonElement>('[aria-label="Закрыть"]')?.click();
    });
    expect(container?.textContent).not.toContain('Camera settings panel');
    expect(document.activeElement).toBe(opener);
  }
);

it.each([false, true])(
  'dismisses a nested listbox before the curtain (empty: %s)',
  async (empty) => {
    renderSelectWithCustomOptionsPanel(
      vi.fn(),
      <PopupSelect
        aria-label="Nested value"
        options={empty ? [] : [{ label: 'First', value: 'first' }]}
        value="first"
        onChange={vi.fn()}
      />
    );
    await act(async () =>
      container?.querySelector<HTMLButtonElement>('[aria-label="Quality"]')?.click()
    );
    const nested = container?.querySelector<HTMLButtonElement>('[aria-label="Nested value"]');
    await act(async () => nested?.click());
    await act(async () => Promise.resolve());
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    const target = document.body.querySelector('[role="option"]') ?? nested;
    await act(async () =>
      target?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(container?.querySelector('[data-ui="popup.inline-curtain.header"]')).not.toBeNull();
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(nested);
    await act(async () =>
      nested?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    );
    expect(container?.querySelector('[data-ui="popup.inline-curtain.header"]')).toBeNull();
  }
);
