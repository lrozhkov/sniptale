// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureActionDropdown, TimerDropdown } from './dropdowns';

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

function renderCaptureDropdown() {
  ensureContainer();
  const captureButtonRef = createButtonRef();

  act(() => {
    root?.render(
      <CaptureActionDropdown
        captureDropdownMenuRef={createMenuRef()}
        captureButtonRef={captureButtonRef}
        compactMenus={false}
        displayMode="horizontal"
        getMenuPosition={() => 'down'}
        captureAction="download_default"
        captureActionOptions={[
          {
            value: 'download_default',
            label: 'Download',
            hint: 'Default',
            icon: <span>Icon</span>,
          },
        ]}
        onSelect={() => undefined}
      />
    );
  });
}

function renderTimerDropdown() {
  ensureContainer();
  const timerButtonRef = createButtonRef();

  act(() => {
    root?.render(
      <TimerDropdown
        timerDropdownMenuRef={createMenuRef()}
        timerButtonRef={timerButtonRef}
        compactMenus={true}
        displayMode="horizontal"
        getMenuPosition={() => 'up'}
        timerDelay={3}
        timerOptions={[{ value: 3, label: '3 seconds', hint: 'Delay' }]}
        closeMenus={() => undefined}
        onTimerDelayChange={() => undefined}
      />
    );
  });
}

function renderVerticalCaptureDropdown() {
  ensureContainer();
  const captureButtonRef = createButtonRef();

  act(() => {
    root?.render(
      <CaptureActionDropdown
        captureDropdownMenuRef={createMenuRef()}
        captureButtonRef={captureButtonRef}
        compactMenus={true}
        displayMode="vertical"
        getMenuPosition={() => 'down'}
        captureAction="download_default"
        captureActionOptions={[
          {
            value: 'download_default',
            label: 'Download',
            hint: 'Default',
            icon: <span>Icon</span>,
          },
        ]}
        onSelect={() => undefined}
        viewportRightInset={0}
      />
    );
  });
}

function renderVerticalCaptureDropdownWithSidebarInset() {
  ensureContainer();
  const captureButtonRef = createButtonRef({
    left: 860,
    right: 896,
    x: 860,
  });

  act(() => {
    root?.render(
      <CaptureActionDropdown
        captureDropdownMenuRef={createMenuRef()}
        captureButtonRef={captureButtonRef}
        compactMenus={true}
        displayMode="vertical"
        getMenuPosition={() => 'down'}
        captureAction="download_default"
        captureActionOptions={[
          {
            value: 'download_default',
            label: 'Download',
            hint: 'Default',
            icon: <span>Icon</span>,
          },
        ]}
        onSelect={() => undefined}
        viewportRightInset={348}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 1280);
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

describe('ToolbarCaptureMenuDropdowns', () => {
  it('anchors the capture action dropdown through the shared floating-menu helper', () => {
    renderCaptureDropdown();

    const menuRoot = container?.querySelector('[data-ui="content.toolbar.capture-action-menu"]');
    const menuSurface = menuRoot?.querySelector('.sniptale-popover-menu') as HTMLDivElement | null;

    expect(menuRoot).not.toBeNull();
    expect(menuSurface?.style.top).toBe('calc(100% + 10px)');
    expect(menuSurface?.style.left).toBe('0px');
  });

  it('anchors the timer dropdown and keeps the semantic placement in sync', () => {
    renderTimerDropdown();

    const menuRoot = container?.querySelector('[data-ui="content.toolbar.timer-menu"]');
    const menu = menuRoot?.querySelector('.sniptale-popover-menu.sniptale-popover-up');

    expect(menuRoot).not.toBeNull();
    expect(menu).not.toBeNull();
    expect(menu instanceof HTMLDivElement ? menu.style.bottom : '').toBe('calc(100% + 10px)');
  });

  it('opens vertical dropdown menus beside the toolbar without overlapping it', () => {
    renderVerticalCaptureDropdown();

    const menuRoot = container?.querySelector('[data-ui="content.toolbar.capture-action-menu"]');
    const menuSurface = menuRoot?.querySelector('.sniptale-popover-menu') as HTMLDivElement | null;

    expect(menuSurface?.style.left).toBe('calc(100% + 10px)');
    expect(menuSurface?.style.top).toBe('0px');
    expect(menuRoot?.querySelector('.sniptale-toolbar-menu--compact')).not.toBeNull();
    expect(menuSurface?.className.includes('sniptale-popover-side')).toBe(true);
    expect(menuSurface?.className.includes('sniptale-popover-up')).toBe(false);
  });

  it('opens the vertical capture dropdown away from the reserved sidebar work area', () => {
    renderVerticalCaptureDropdownWithSidebarInset();

    const menuRoot = container?.querySelector('[data-ui="content.toolbar.capture-action-menu"]');
    const menuSurface = menuRoot?.querySelector('.sniptale-popover-menu') as HTMLDivElement | null;

    expect(menuSurface?.style.left).toBe('auto');
    expect(menuSurface?.style.right).toBe('calc(100% + 10px)');
  });
});
