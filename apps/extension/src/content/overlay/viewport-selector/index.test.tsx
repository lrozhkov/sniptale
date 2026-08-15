// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const viewportSelectorMocks = vi.hoisted(() => ({
  availabilityByIdMock: new Map(),
  menuPlacementMock: vi.fn(() => 'down'),
  menuStateChangeMock: vi.fn(),
  onViewportChangeMock: vi.fn(),
  presetsMock: [
    {
      kind: 'user',
      id: 'preset-hd',
      name: 'HD',
      target: 'window',
      width: 1280,
      height: 720,
      enabled: true,
      order: 0,
    },
    {
      kind: 'user',
      id: 'window-hd',
      name: 'Window HD',
      target: 'window',
      width: 1280,
      height: 720,
      enabled: true,
      order: 0,
    },
  ],
  resolveToolbarFloatingMenuStyleMock: vi.fn(() => ({ top: '10px', left: 0 })),
}));

vi.mock('../../../platform/i18n', () => ({
  formatNumber: (value: number) => String(value),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

vi.mock('../toolbar/menu/floating.helpers', () => ({
  resolveToolbarFloatingMenuStyle: viewportSelectorMocks.resolveToolbarFloatingMenuStyleMock,
  resolveToolbarMenuPlacement: viewportSelectorMocks.menuPlacementMock,
}));

vi.mock('./presets', () => ({
  useViewportSelectorPresets: () => ({
    availabilityById: viewportSelectorMocks.availabilityByIdMock,
    presets: viewportSelectorMocks.presetsMock,
  }),
}));

import { ViewportSelector } from '.';
import { ToolbarViewportMenu } from '../toolbar/capture/menus';
import { useToolbarCaptureMenus } from '../toolbar/capture/use-menus';
import { useToolbarMenuState } from '../toolbar/state/menu';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  viewportSelectorMocks.menuPlacementMock.mockClear();
  viewportSelectorMocks.availabilityByIdMock.clear();
  viewportSelectorMocks.menuStateChangeMock.mockClear();
  viewportSelectorMocks.onViewportChangeMock.mockClear();
  viewportSelectorMocks.resolveToolbarFloatingMenuStyleMock.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

it('uses native button click activation for keyboard-selected presets', async () => {
  const preset = viewportSelectorMocks.presetsMock[0]!;
  viewportSelectorMocks.availabilityByIdMock.set(preset.id, {
    presetId: preset.id,
    required: { width: preset.width, height: preset.height },
    status: 'available',
    target: preset.target,
  });
  await renderSelector();
  const toggle = container?.querySelector<HTMLButtonElement>('button');
  if (!toggle) throw new Error('Expected viewport selector button');
  await act(async () => toggle.click());
  const presetButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).find((candidate) => candidate.textContent?.startsWith('HD'));
  if (!presetButton) throw new Error('Expected preset button');

  await act(async () => {
    presetButton.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
  });

  expect(viewportSelectorMocks.onViewportChangeMock).toHaveBeenCalledWith(
    {
      height: 720,
      presetId: 'preset-hd',
      target: 'window',
      width: 1280,
    },
    expect.any(MouseEvent)
  );
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

async function renderSelector(props: Partial<Parameters<typeof ViewportSelector>[0]> = {}) {
  await act(async () => {
    root?.render(
      <ViewportSelector
        currentViewport={null}
        onViewportChange={viewportSelectorMocks.onViewportChangeMock}
        onMenuStateChange={viewportSelectorMocks.menuStateChangeMock}
        {...props}
      />
    );
  });
}

function ToolbarMenuSwitchHarness() {
  const menuState = useToolbarMenuState();
  const menus = useToolbarCaptureMenus(menuState);

  return (
    <div className="sniptale-toolbar">
      <ToolbarViewportMenu
        closeMenus={menus.closeMenus}
        compactMenus={false}
        currentViewport={null}
        displayMode="horizontal"
        getViewportMenuPosition={() => 'down'}
        isLoading={false}
        onViewportChange={vi.fn()}
        screenshotMode
        setViewportMenuOpen={menus.setViewportMenuOpen}
        viewportSelectorRef={menus.viewportSelectorRef}
        viewportWrapperRef={menus.viewportWrapperRef}
      />
      <button
        className="sniptale-btn"
        data-ui="test.settings-button"
        onClick={() => menuState.toggleMenu('settings')}
      >
        Settings
      </button>
      <output data-ui="test.active-menu">{menuState.activeMenuType ?? 'none'}</output>
    </div>
  );
}

it('renders the selector without a synthetic loading contract and opens the menu on demand', async () => {
  await renderSelector();

  const button = container?.querySelector<HTMLButtonElement>('button');
  if (!button) {
    throw new Error('Expected viewport selector button');
  }

  expect(button.disabled).toBe(false);
  expect(button.querySelector('svg')).not.toBeNull();
  expect(container?.textContent).not.toContain('loading');

  await act(async () => {
    button.click();
  });

  expect(viewportSelectorMocks.menuStateChangeMock).toHaveBeenCalledWith(true);
  expect(container?.textContent).toContain('content.toolbar.viewportNativeLabel');
  expect(container?.textContent).toContain('HD');
  expect(container?.textContent).toContain('viewportPresets.groups.window');
  expect(container?.textContent).not.toContain('viewportPresets.groups.viewport');
  expect(container?.textContent).not.toContain('viewportPresets.availability.checking');
  const presetButton = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).find((candidate) => candidate.textContent?.includes('HD'));
  expect(presetButton?.disabled).toBe(false);
  expect(presetButton?.getAttribute('aria-disabled')).toBe('true');
  expect(presetButton?.textContent).toContain('1280 × 720');
  expect(container?.textContent).not.toContain('content.toolbar.viewportNativeHint');
  expect(container?.querySelectorAll('.sniptale-toolbar-menu-detail')).toHaveLength(0);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 410));
  });
  expect(container?.textContent).not.toContain('viewportPresets.availability.checking');
  expect(container?.querySelectorAll('.sniptale-toolbar-menu-detail')).toHaveLength(0);
  expect(container?.textContent?.split('viewportPresets.hints.window')).toHaveLength(2);
  expect(
    container?.querySelector('.sniptale-popover-menu')?.querySelector('.sniptale-popover-icon')
  ).toBeNull();
});

it('hides group hints in compact menu view', async () => {
  await renderSelector({ compactMenus: true });

  await act(async () => container?.querySelector<HTMLButtonElement>('button')?.click());

  expect(container?.textContent).toContain('viewportPresets.groups.window');
  expect(container?.textContent).not.toContain('viewportPresets.groups.viewport');
  expect(container?.textContent).not.toContain('viewportPresets.hints.window');
  expect(container?.textContent).not.toContain('viewportPresets.hints.viewport');
});

it('does not republish an unchanged open state when the parent callback changes', async () => {
  const firstStateChange = vi.fn();
  const nextStateChange = vi.fn();
  await renderSelector({ onMenuStateChange: firstStateChange });
  const toggle = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.viewport-button"]'
  );

  await act(async () => toggle?.click());
  expect(firstStateChange).toHaveBeenLastCalledWith(true);

  await renderSelector({ onMenuStateChange: nextStateChange });

  expect(nextStateChange).not.toHaveBeenCalled();
  expect(container?.querySelector('.sniptale-popover-menu')).not.toBeNull();
});

it('switches from viewport sizing to toolbar settings in one click', async () => {
  await act(async () => root?.render(<ToolbarMenuSwitchHarness />));
  const viewportButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.viewport-button"]'
  );
  const settingsButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="test.settings-button"]'
  );
  const activeMenu = container?.querySelector<HTMLOutputElement>('[data-ui="test.active-menu"]');

  await act(async () => viewportButton?.click());
  expect(activeMenu?.textContent).toBe('viewport');

  await act(async () => settingsButton?.click());

  expect(activeMenu?.textContent).toBe('settings');
  expect(container?.querySelector('.sniptale-viewport-menu')).toBeNull();
});

it('renders the active availability notification above the preset list', async () => {
  const [viewportPreset, windowPreset] = viewportSelectorMocks.presetsMock;
  if (!viewportPreset || !windowPreset) throw new Error('Expected selector fixtures');
  viewportSelectorMocks.availabilityByIdMock.set(viewportPreset.id, {
    presetId: viewportPreset.id,
    required: { width: viewportPreset.width, height: viewportPreset.height },
    status: 'available',
    target: viewportPreset.target,
  });
  viewportSelectorMocks.availabilityByIdMock.set(windowPreset.id, {
    presetId: windowPreset.id,
    reason: 'surface-busy',
    required: { width: windowPreset.width, height: windowPreset.height },
    status: 'unavailable',
    target: windowPreset.target,
  });
  await renderSelector();

  await act(async () => container?.querySelector<HTMLButtonElement>('button')?.click());

  const notification = container?.querySelector('.sniptale-toolbar-menu-detail');
  const firstPreset = Array.from(
    container?.querySelectorAll<HTMLButtonElement>('button') ?? []
  ).find((button) => button.textContent?.includes('Window HD'));
  expect(notification?.textContent).toBe('viewportPresets.availability.busy');
  expect(
    notification && firstPreset
      ? Boolean(
          notification.compareDocumentPosition(firstPreset) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      : false
  ).toBe(true);
});
