// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBridgedMouseEvent } from '../../../platform/trusted-events/synthetic-mouse';
import { ToolbarSettingsDropdown } from './settings-content';

const createTrustedContentActionIntentSource = vi.hoisted(() =>
  vi.fn(() => ({ kind: 'trusted-content-event' as const }))
);

vi.mock('../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/privileged-action-intent')>()),
  createTrustedContentActionIntentSource,
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function ensureContainer() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
}

function createButtonRef(rectOverrides?: Partial<DOMRect>) {
  const button = document.createElement('button');
  document.body.appendChild(button);
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
    bottom: 80,
    height: 36,
    left: 100,
    right: 136,
    top: 44,
    width: 36,
    x: 100,
    y: 44,
    toJSON: () => ({}),
    ...rectOverrides,
  });

  return {
    current: button,
  } as React.RefObject<HTMLButtonElement | null>;
}

function createMenuRef() {
  return {
    current: null,
  } as React.RefObject<HTMLDivElement | null>;
}

function renderSettingsDropdown(params?: {
  freePlacement?: boolean;
  onFreePlacementChange?: (value: boolean) => void;
  onDisableScreenshotMode?: (activationEvent?: Event) => void;
  pinToTab?: boolean;
  pinToTabAvailable?: boolean;
  pinToTabLocked?: boolean;
}) {
  ensureContainer();
  const onPinToTabChange = vi.fn();
  const onDisableScreenshotMode = vi.fn((activationEvent?: Event) =>
    params?.onDisableScreenshotMode?.(activationEvent)
  );

  act(() => {
    root?.render(
      <ToolbarSettingsDropdown
        compactMenus={true}
        {...(params?.freePlacement === undefined ? {} : { freePlacement: params.freePlacement })}
        onFreePlacementChange={params?.onFreePlacementChange}
        displayMode="vertical"
        menuRef={createMenuRef()}
        onClose={() => undefined}
        onCompactMenusChange={() => undefined}
        onDisplayModeChange={() => undefined}
        onDisableScreenshotMode={onDisableScreenshotMode}
        onHide={() => undefined}
        onPinToTabChange={onPinToTabChange}
        pinToTab={params?.pinToTab ?? false}
        pinToTabAvailable={params?.pinToTabAvailable ?? true}
        pinToTabLocked={params?.pinToTabLocked ?? false}
        screenshotMode={true}
        triggerRef={createButtonRef()}
        viewportRightInset={0}
      />
    );
  });

  return { onDisableScreenshotMode, onPinToTabChange };
}

function renderSettingsDropdownNearSidebar() {
  ensureContainer();

  act(() => {
    root?.render(
      <ToolbarSettingsDropdown
        compactMenus={true}
        displayMode="vertical"
        menuRef={createMenuRef()}
        onClose={() => undefined}
        onCompactMenusChange={() => undefined}
        onDisplayModeChange={() => undefined}
        onDisableScreenshotMode={() => undefined}
        onHide={() => undefined}
        onPinToTabChange={() => undefined}
        pinToTab={false}
        pinToTabAvailable={true}
        pinToTabLocked={false}
        screenshotMode={true}
        triggerRef={createButtonRef({
          left: 860,
          right: 896,
          x: 860,
        })}
        viewportRightInset={348}
      />
    );
  });
}

function findButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(label)
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 900);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ToolbarSettingsDropdown', () => {
  it('opens beside the toolbar in vertical mode', () => {
    renderSettingsDropdown();

    const menuRoot = container?.firstElementChild as HTMLDivElement | null;
    const menuSurface = menuRoot?.querySelector('.sniptale-popover-menu') as HTMLDivElement | null;

    expect(menuSurface?.style.left).toBe('calc(100% + 10px)');
    expect(menuSurface?.style.top).toBe('0px');
    expect(menuSurface?.className.includes('sniptale-popover-side')).toBe(true);
  });

  it('opens away from the reserved sidebar work area in vertical mode', () => {
    renderSettingsDropdownNearSidebar();

    const menuRoot = container?.firstElementChild as HTMLDivElement | null;
    const menuSurface = menuRoot?.querySelector('.sniptale-popover-menu') as HTMLDivElement | null;

    expect(menuSurface?.style.left).toBe('auto');
    expect(menuSurface?.style.right).toBe('calc(100% + 10px)');
  });

  it('toggles pin-to-tab from the settings menu', () => {
    const { onPinToTabChange } = renderSettingsDropdown({ pinToTab: false });
    const pinButton = findButton('content.toolbar.pinToTab');

    act(() => {
      pinButton?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onPinToTabChange).toHaveBeenCalledWith(true, { kind: 'trusted-content-event' });
    expect(createTrustedContentActionIntentSource).toHaveBeenCalledOnce();
  });

  it('uses the same collapse glyph as the Navigate toolbar action', () => {
    renderSettingsDropdown();

    const collapseButton = findButton('content.toolbar.hideToolbar');
    expect(collapseButton?.querySelector('svg')?.classList).toContain('lucide-panel-bottom-close');
  });

  it('preserves the native exit gesture for screenshot capability recovery', () => {
    const { onDisableScreenshotMode } = renderSettingsDropdown();
    const exitButton = findButton('content.toolbar.screenshotDisable');

    act(() => {
      exitButton?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });

    expect(onDisableScreenshotMode).toHaveBeenCalledOnce();
    expect(onDisableScreenshotMode.mock.calls[0]?.[0]).toBeInstanceOf(MouseEvent);
  });

  it('disables the pin-to-tab toggle when scenario mode locks it', () => {
    const { onPinToTabChange } = renderSettingsDropdown({ pinToTabLocked: true });
    const pinButton = findButton('content.toolbar.pinToTab');

    expect(pinButton).toBeDefined();
    expect(pinButton?.hasAttribute('disabled')).toBe(true);

    act(() => {
      pinButton?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onPinToTabChange).not.toHaveBeenCalled();
  });

  it('disables pin-to-tab when persistent all-sites access is unavailable', () => {
    const { onPinToTabChange } = renderSettingsDropdown({ pinToTabAvailable: false });
    const pinButton = findButton('content.toolbar.pinToTab');

    expect(pinButton).toBeDefined();
    expect(pinButton?.hasAttribute('disabled')).toBe(true);
    expect(pinButton?.textContent).toContain('content.toolbar.pinToTabUnavailableHint');

    act(() => {
      pinButton?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(onPinToTabChange).not.toHaveBeenCalled();
  });
});

it('shows manual orientation only in free placement and toggles with pointer and keyboard activation', () => {
  const onFreePlacementChange = vi.fn();
  renderSettingsDropdown({ freePlacement: false, onFreePlacementChange });
  expect(container?.textContent).not.toContain('content.toolbar.panelHorizontal');
  const toggle = [...container!.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('content.toolbar.panelFreePlacement')
  )!;
  act(() => toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(onFreePlacementChange).toHaveBeenLastCalledWith(true);
  renderSettingsDropdown({ freePlacement: true, onFreePlacementChange });
  expect(container?.textContent).toContain('content.toolbar.panelHorizontal');
  expect(container?.textContent).toContain('content.toolbar.panelVertical');
  const selected = [...container!.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('content.toolbar.panelFreePlacement')
  )!;
  expect(selected.classList.contains('sniptale-popover-item-selected')).toBe(true);
  expect(selected.firstElementChild?.classList.contains('lucide-move')).toBe(true);
  expect(selected.lastElementChild?.classList.contains('sniptale-popover-check')).toBe(true);
  act(() => selected.click());
  expect(onFreePlacementChange).toHaveBeenLastCalledWith(false);
});

it('repositions the settings menu using its measured height near a viewport edge', () => {
  vi.stubGlobal('innerHeight', 640);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(610);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(280);
  renderSettingsDropdown({ freePlacement: true, onFreePlacementChange: vi.fn() });
  const menu = container?.querySelector<HTMLElement>('.sniptale-popover-menu');
  expect(menu?.style.top).toBe('-22px');
  expect(menu?.style.overflowY).toBe('auto');
  vi.unstubAllGlobals();
});

it('activates once for a bridged pointer gesture and still accepts keyboard clicks', () => {
  const onFreePlacementChange = vi.fn();
  renderSettingsDropdown({ freePlacement: false, onFreePlacementChange });
  const button = findButton('content.toolbar.panelFreePlacement')!;
  act(() => {
    const source = new MouseEvent('mousedown', { button: 0, buttons: 1 });
    button.dispatchEvent(createBridgedMouseEvent('mousedown', source));
    button.dispatchEvent(createBridgedMouseEvent('click', source));
  });
  expect(onFreePlacementChange).toHaveBeenCalledTimes(1);
  act(() => button.click());
  expect(onFreePlacementChange).toHaveBeenCalledTimes(2);
});
