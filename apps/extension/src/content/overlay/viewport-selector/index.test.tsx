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
      target: 'viewport',
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
      target: 'viewport',
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
  expect(container?.textContent?.indexOf('viewportPresets.groups.window')).toBeLessThan(
    container?.textContent?.indexOf('viewportPresets.groups.viewport') ?? -1
  );
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
  expect(container?.textContent).toContain('viewportPresets.availability.checking');
  expect(container?.querySelectorAll('.sniptale-toolbar-menu-detail')).toHaveLength(1);
  const status = container?.querySelector('.sniptale-toolbar-menu-detail');
  expect(
    status && presetButton
      ? Boolean(status.compareDocumentPosition(presetButton) & Node.DOCUMENT_POSITION_FOLLOWING)
      : false
  ).toBe(true);
  expect(container?.textContent?.split('viewportPresets.hints.viewport')).toHaveLength(2);
  expect(
    container?.querySelector('.sniptale-popover-menu')?.querySelector('.sniptale-popover-icon')
  ).toBeNull();
});

it('does not dismiss on mousedown before a toolbar peer receives its click', async () => {
  await act(async () => {
    root?.render(
      <div className="sniptale-toolbar">
        <ViewportSelector
          currentViewport={null}
          onViewportChange={viewportSelectorMocks.onViewportChangeMock}
          onMenuStateChange={viewportSelectorMocks.menuStateChangeMock}
        />
        <button aria-haspopup="menu" className="sniptale-btn" data-ui="test.toolbar-peer">
          Settings
        </button>
      </div>
    );
  });
  const toggle = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.viewport-button"]'
  );
  const peer = container?.querySelector<HTMLButtonElement>('[data-ui="test.toolbar-peer"]');

  await act(async () => toggle?.click());
  expect(container?.querySelector('.sniptale-popover-menu')).not.toBeNull();

  await act(async () => {
    peer?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  });
  expect(container?.querySelector('.sniptale-popover-menu')).not.toBeNull();
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
