// @vitest-environment jsdom

import { act, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createSolidPaint } from '@sniptale/foundation/paint';
import { beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';

const paintSelectorProps = vi.hoisted(() => vi.fn());

vi.mock('../paint-selector', async (importOriginal) => ({
  ...(await importOriginal()),
  CompactPaintSelector: (props: {
    onOpenChange?: (open: boolean) => void;
    onPreviewChange?: (paint: ReturnType<typeof createSolidPaint>) => void;
    onPreviewReset?: () => void;
  }) => {
    paintSelectorProps(props);
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
    customized: false,
    enabled: true,
    favorite: false,
    isDefault: true,
    style: style('#fff'),
  },
  {
    id: 'glass',
    name: 'Glass',
    origin: 'user' as const,
    order: 0,
    customized: false,
    enabled: true,
    favorite: true,
    isDefault: false,
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

it('renders the field label and selector on one compact row', async () => {
  const root = createRoot(document.querySelector('#root')!);
  await act(async () =>
    root.render(
      <SurfaceStyleSelector
        actions={actions}
        fieldLabel="Surface style"
        presentation="selection"
        presets={presets}
        value={style('#fff')}
        onChange={vi.fn()}
      />
    )
  );
  const selector = document.querySelector('[data-ui="shared.ui.surface-style-selector"]')!;
  expect(selector.firstElementChild?.textContent).toContain('Surface style');
  expect(
    selector.firstElementChild?.querySelector(
      '[data-ui="shared.ui.surface-style-selector.trigger"]'
    )
  ).not.toBeNull();
  await act(async () => root.unmount());
});

it('publishes paint previews live and restores the opening surface on cancel', async () => {
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
  await act(async () =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === translate('content.callout.surfaceStyle.color'))!
      .click()
  );
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-ui="paint-mock"]')!.click()
  );
  const paint = paintSelectorProps.mock.calls.at(-1)?.[0];
  await act(async () => paint.onPreviewChange?.(createSolidPaint('#123456')));
  expect(onChange).toHaveBeenLastCalledWith(style('#123456'));
  await act(async () => paint.onPreviewReset?.());
  expect(onChange).toHaveBeenLastCalledWith(style('#fff'));
  await act(async () => root.unmount());
});

it('keeps the Color editor active when a picked color matches the Plain surface preset', async () => {
  function StatefulSelector() {
    const [value, setValue] = useState(style('#123456'));
    return (
      <SurfaceStyleSelector
        actions={actions}
        presentation="selection"
        presets={presets}
        value={value}
        onChange={setValue}
      />
    );
  }

  const root = createRoot(document.querySelector('#root')!);
  await act(async () => root.render(<StatefulSelector />));
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[aria-expanded="false"]')!.click()
  );
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[data-ui="paint-mock"]')!.click()
  );
  const paint = paintSelectorProps.mock.calls.at(-1)?.[0];
  await act(async () => paint.onPreviewChange?.(createSolidPaint('#fff')));

  expect(document.querySelector('[data-ui="paint-mock"]')).not.toBeNull();
  expect(
    [...document.querySelectorAll<HTMLButtonElement>('[aria-pressed="true"]')].some(
      (button) => button.textContent === translate('content.callout.surfaceStyle.color')
    )
  ).toBe(true);
  await act(async () => root.unmount());
});

it('previews the complete surface and exposes the selected preset state', async () => {
  const root = createRoot(document.querySelector('#root')!);
  await act(async () =>
    root.render(
      <SurfaceStyleSelector
        actions={actions}
        presentation="selection"
        presets={presets}
        value={style('#ffffff80', 'backdrop-filter: blur(16px);')}
        onChange={vi.fn()}
      />
    )
  );
  const trigger = document.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.surface-style-selector.trigger"]'
  )!;
  const preview = trigger.querySelector<HTMLElement>(
    '[data-ui="shared.ui.surface-style-selector.preview"]'
  )!;
  expect(trigger.textContent).toContain('Glass');
  expect(trigger.textContent).not.toContain(translate('content.callout.surfaceStyle.title'));
  expect(preview.style.backdropFilter).toBe('blur(16px)');
  await act(async () => trigger.click());
  const selected = [...document.querySelectorAll<HTMLButtonElement>('[aria-pressed="true"]')].find(
    (button) => button.textContent?.includes('Glass')
  );
  expect(selected).not.toBeUndefined();
  expect(selected?.className).toContain('focus-visible:shadow-');
  expect(selected?.querySelector('span')?.className).toContain('h-6 w-9');
  expect(selected?.querySelector('.lucide-check')?.parentElement?.className).toContain(
    'text-[var(--sniptale-color-accent-emphasis)]'
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain(
    translate('content.callout.surfaceStyle.backgroundType')
  );
  expect(document.querySelector('[role="dialog"]')?.className).toContain('outline-none');
  await act(async () => root.unmount());
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
