// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolbarSettingsDropdown } from './settings-content';

const createTrustedContentActionIntentSource = vi.hoisted(() =>
  vi.fn(() => ({ kind: 'trusted-content-event' as const }))
);

vi.mock('../../../application/privileged-action-intent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../application/privileged-action-intent')>()),
  createTrustedContentActionIntentSource,
}));

vi.mock('../../../../platform/i18n', () => ({
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
    expect(collapseButton?.querySelector('svg')?.classList).toContain('lucide-panel-top-close');
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
