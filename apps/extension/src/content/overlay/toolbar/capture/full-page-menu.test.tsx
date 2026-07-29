// @vitest-environment jsdom

import React, { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { FullPageCaptureSplitButton } from './full-page-menu';
import { useToolbarMenuState } from '../state/menu';
import type { FullPageCapturePreferences } from '../../../../contracts/full-page-capture';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness(props: {
  compactMenus?: boolean;
  currentViewport?: { height: number; width: number } | null;
  displayMode?: 'horizontal' | 'vertical';
  onPrimaryClick?: React.MouseEventHandler<HTMLButtonElement>;
  onUpdate?: (patch: {
    floatingElements?: 'hide' | 'once' | 'repeat';
    freezeMotion?: boolean;
    preloadLazyContent?: boolean;
  }) => Promise<void>;
}) {
  const menu = useToolbarMenuState();
  const [preferences, setPreferences] = useState<FullPageCapturePreferences>({
    floatingElements: 'once' as const,
    freezeMotion: true,
    preloadLazyContent: true,
  });
  return (
    <>
      <button data-ui="test.other-menu" onClick={() => menu.toggleMenu('capture')}>
        Other menu
      </button>
      <output data-ui="test.active-menu">{menu.activeMenuType ?? 'none'}</output>
      <FullPageCaptureSplitButton
        compactMenus={props.compactMenus ?? false}
        currentViewport={props.currentViewport ?? null}
        disabled={false}
        displayMode={props.displayMode ?? 'horizontal'}
        onPrimaryClick={props.onPrimaryClick ?? vi.fn()}
        onUpdate={async (patch) => {
          await props.onUpdate?.(patch);
          setPreferences((current) => ({ ...current, ...patch }));
        }}
        preferences={preferences}
        saving={false}
        toolbarMenuState={menu}
      />
    </>
  );
}

function render(node: React.ReactNode): HTMLDivElement {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

it('keeps primary capture and preference-menu activation separate', () => {
  const onPrimaryClick = vi.fn();
  const view = render(<Harness onPrimaryClick={onPrimaryClick} />);
  expect(view.querySelector('.sniptale-split-action')).not.toBeNull();
  expect(view.querySelector('.sniptale-split-action-start')).not.toBeNull();
  expect(view.querySelector('.sniptale-split-action-end')).not.toBeNull();

  act(() => {
    view
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.capture-full-button"]')
      ?.click();
  });
  expect(onPrimaryClick).toHaveBeenCalledOnce();
  expect(view.querySelector('[data-ui="content.toolbar.full-page-menu"]')).toBeNull();

  act(() => {
    view
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.capture-full-settings-button"]')
      ?.click();
  });
  expect(onPrimaryClick).toHaveBeenCalledOnce();
  expect(view.querySelector('[data-ui="content.toolbar.full-page-menu"]')).not.toBeNull();
});

it('updates floating mode and exposes the custom viewport hint', async () => {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <Harness currentViewport={{ height: 720, width: 1_280 }} onUpdate={onUpdate} />
  );
  act(() => {
    view
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.capture-full-settings-button"]')
      ?.click();
  });

  await act(async () => {
    const item = view.querySelector<HTMLElement>(
      '[data-ui="content.toolbar.full-page-floating.hide"]'
    );
    item?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    item?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    await Promise.resolve();
  });

  expect(onUpdate).toHaveBeenCalledWith({ floatingElements: 'hide' });
  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(document.getElementById('sniptale-full-page-viewport-hint')).not.toBeNull();
  expect(
    view.querySelector('[data-ui="content.toolbar.full-page-floating.once"] .lucide-pin')
  ).not.toBeNull();
  expect(
    view.querySelector('[data-ui="content.toolbar.full-page-floating.repeat"] .lucide-repeat-2')
  ).not.toBeNull();
});

it.each([
  ['Enter', 'fullPageFloatingHide', 'content.toolbar.full-page-floating.hide'],
  [' ', 'fullPageFreezeMotion', null],
] as const)('updates %s preference from native keyboard activation', async (key, label, dataUi) => {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  const view = render(<Harness onUpdate={onUpdate} />);
  act(() => {
    view
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.capture-full-settings-button"]')
      ?.click();
  });
  const item = dataUi
    ? view.querySelector<HTMLButtonElement>(`[data-ui="${dataUi}"]`)
    : Array.from(view.querySelectorAll<HTMLButtonElement>('.sniptale-full-page-menu button')).find(
        (button) => button.textContent?.includes(label)
      );

  await act(async () => {
    item?.focus();
    item?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
    item?.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key }));
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    await Promise.resolve();
  });

  expect(onUpdate).toHaveBeenCalledTimes(1);
  expect(onUpdate).toHaveBeenCalledWith(
    key === 'Enter' ? { floatingElements: 'hide' } : { freezeMotion: false }
  );
});

it('switches to the full-page menu through the mutual toolbar menu state', () => {
  const view = render(<Harness />);
  const activeMenu = view.querySelector<HTMLOutputElement>('[data-ui="test.active-menu"]');
  act(() => {
    view.querySelector<HTMLButtonElement>('[data-ui="test.other-menu"]')?.click();
  });
  expect(activeMenu?.textContent).toBe('capture');

  act(() => {
    view
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.capture-full-settings-button"]')
      ?.click();
  });

  expect(activeMenu?.textContent).toBe('full-page');
  expect(view.querySelector('[data-ui="content.toolbar.full-page-menu"]')).not.toBeNull();
});

it.each(['horizontal', 'vertical'] as const)(
  'closes the %s menu on Escape and returns focus to the chevron',
  async (displayMode) => {
    const view = render(<Harness displayMode={displayMode} />);
    const trigger = view.querySelector<HTMLButtonElement>(
      '[data-ui="content.toolbar.capture-full-settings-button"]'
    );
    act(() => trigger?.click());

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await Promise.resolve();
    });

    expect(view.querySelector('[data-ui="content.toolbar.full-page-menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  }
);

it('closes on an outside pointer interaction', () => {
  const view = render(<Harness compactMenus />);
  act(() => {
    view
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.capture-full-settings-button"]')
      ?.click();
  });
  expect(view.querySelector('[data-ui="content.toolbar.full-page-menu"]')).not.toBeNull();

  act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));

  expect(view.querySelector('[data-ui="content.toolbar.full-page-menu"]')).toBeNull();
});

it('stays open near the popover and closes when the pointer moves far away', () => {
  const view = render(<Harness />);
  act(() => {
    view
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.capture-full-settings-button"]')
      ?.click();
  });
  const popover = view.querySelector<HTMLElement>('.sniptale-full-page-menu');
  vi.spyOn(popover!, 'getBoundingClientRect').mockReturnValue({
    bottom: 200,
    height: 100,
    left: 100,
    right: 300,
    top: 100,
    width: 200,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  });

  act(() => {
    document.body.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 340, clientY: 220 })
    );
  });
  expect(view.querySelector('[data-ui="content.toolbar.full-page-menu"]')).not.toBeNull();

  act(() => {
    document.body.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 620, clientY: 520 })
    );
  });
  expect(view.querySelector('[data-ui="content.toolbar.full-page-menu"]')).toBeNull();
});
