// @vitest-environment jsdom

import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createSolidPaint } from '@sniptale/foundation/paint';
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../paint-selector', async (importOriginal) => ({
  ...(await importOriginal()),
  CompactPaintSelector: (props: { onOpenChange?: (open: boolean) => void }) => {
    const [open, setOpen] = useState(false);
    useEffect(() => {
      if (!open) return;
      const close = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        setOpen(false);
        props.onOpenChange?.(false);
      };
      document.addEventListener('keydown', close, true);
      return () => document.removeEventListener('keydown', close, true);
    }, [open, props]);
    return (
      <div data-floating-ui-owner-id="paint-owner">
        <button
          type="button"
          data-ui="paint-mock"
          onClick={() => {
            setOpen(true);
            props.onOpenChange?.(true);
          }}
        >
          Paint
        </button>
        {open ? <div data-floating-ui-owned-by="paint-owner">Paint layer</div> : null}
      </div>
    );
  },
}));

import { SurfaceStyleSelector } from '.';

const style = (color: string, surfaceCss = '') => ({
  fillPaint: createSolidPaint(color),
  surfaceCss,
});
const presets = [
  {
    id: 'plain',
    name: 'Plain',
    origin: 'system' as const,
    order: 0,
    favorite: false,
    style: style('#fff'),
  },
  {
    id: 'glass',
    name: 'Glass',
    origin: 'user' as const,
    order: 0,
    favorite: true,
    style: style('#ffffff80', 'backdrop-filter: blur(16px);'),
  },
];
const actions = {
  onCreate: vi.fn().mockResolvedValue(true),
  onDelete: vi.fn().mockResolvedValue(true),
  onDuplicate: vi.fn().mockResolvedValue(true),
  onRename: vi.fn().mockResolvedValue(true),
  onReorder: vi.fn().mockResolvedValue(true),
  onToggleFavorite: vi.fn().mockResolvedValue(true),
  onUpdate: vi.fn().mockResolvedValue(true),
};

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="root"></div>';
});

it('matches semantically, drafts a preset, and applies only on Apply', async () => {
  const onChange = vi.fn();
  const root = createRoot(document.querySelector('#root')!);
  await act(async () =>
    root.render(
      <SurfaceStyleSelector
        actions={actions}
        presets={presets}
        value={style('#fff')}
        onChange={onChange}
      />
    )
  );
  expect(document.body.textContent).toContain('Plain');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-expanded="false"]')!.click()
  );
  await act(async () =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Glass'))!
      .click()
  );
  expect(onChange).not.toHaveBeenCalled();
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Дублировать"], [aria-label="Duplicate"]')!
      .click()
  );
  expect(actions.onDuplicate).toHaveBeenCalledWith('plain', 'Plain — копия');
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-ui="surface-style.apply"]')!.click()
  );
  expect(onChange).toHaveBeenCalledWith(style('#ffffff80', 'backdrop-filter: blur(16px);'));
});

it('lets Escape close only the top nested Paint layer before the Surface layer', async () => {
  const onOpenChange = vi.fn();
  const root = createRoot(document.querySelector('#root')!);
  await act(async () =>
    root.render(
      <SurfaceStyleSelector
        actions={actions}
        presets={presets}
        value={style('#fff')}
        onChange={vi.fn()}
        onOpenChange={onOpenChange}
      />
    )
  );
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-expanded="false"]')!.click()
  );
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-ui="paint-mock"]')!.click()
  );
  await act(async () =>
    document
      .querySelector('[data-ui="shared.ui.surface-style-selector"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  );
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector('[data-floating-ui-owned-by]')).toBeNull();
  await act(async () =>
    document
      .querySelector('[data-ui="shared.ui.surface-style-selector"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

it('owns outside dismissal, focus containment, restoration, and unmount cleanup', async () => {
  const onOpenChange = vi.fn();
  const root = createRoot(document.querySelector('#root')!);
  await act(async () =>
    root.render(
      <SurfaceStyleSelector
        actions={actions}
        presets={presets}
        value={style('#fff')}
        onChange={vi.fn()}
        onOpenChange={onOpenChange}
      />
    )
  );
  const trigger = document.querySelector<HTMLButtonElement>('[aria-expanded="false"]')!;
  trigger.focus();
  await act(async () => trigger.click());
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(document.activeElement).toBe(dialog);
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }))
  );
  expect(dialog.contains(document.activeElement)).toBe(true);
  const outside = document.body.appendChild(document.createElement('button'));
  await act(async () => outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  await act(async () => Promise.resolve());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);

  await act(async () => trigger.click());
  await act(async () => root.unmount());
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

it('selects a surface immediately without management or favorite actions', async () => {
  const onChange = vi.fn();
  const root = createRoot(document.querySelector('#root')!);
  await act(async () =>
    root.render(
      <SurfaceStyleSelector
        actions={actions}
        presentation="selection"
        presets={presets}
        value={style('#fff')}
        onChange={onChange}
      />
    )
  );
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-expanded="false"]')!.click()
  );
  expect(document.querySelector('[aria-label="Favorite"], [aria-label="В избранное"]')).toBeNull();
  expect(document.querySelector('[data-ui="surface-style.apply"]')).toBeNull();
  await act(async () =>
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Glass'))!
      .click()
  );
  expect(onChange).toHaveBeenCalledWith(style('#ffffff80', 'backdrop-filter: blur(16px);'));
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
