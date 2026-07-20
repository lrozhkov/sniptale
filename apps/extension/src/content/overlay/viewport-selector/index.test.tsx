// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const viewportSelectorMocks = vi.hoisted(() => ({
  menuPlacementMock: vi.fn(() => 'down'),
  menuStateChangeMock: vi.fn(),
  onViewportChangeMock: vi.fn(),
  presetsMock: [{ id: 'preset-hd', label: 'HD', width: 1280, height: 720 }],
  resolveToolbarFloatingMenuStyleMock: vi.fn(() => ({ top: '10px', left: 0 })),
}));

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

vi.mock('../toolbar/menu/floating.helpers', () => ({
  resolveToolbarFloatingMenuStyle: viewportSelectorMocks.resolveToolbarFloatingMenuStyleMock,
  resolveToolbarMenuPlacement: viewportSelectorMocks.menuPlacementMock,
}));

vi.mock('./presets', () => ({
  useViewportSelectorPresets: () => viewportSelectorMocks.presetsMock,
}));

import { ViewportSelector } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  viewportSelectorMocks.menuPlacementMock.mockClear();
  viewportSelectorMocks.menuStateChangeMock.mockClear();
  viewportSelectorMocks.onViewportChangeMock.mockClear();
  viewportSelectorMocks.resolveToolbarFloatingMenuStyleMock.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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
  expect(container?.textContent).not.toContain('loading');

  await act(async () => {
    button.click();
  });

  expect(viewportSelectorMocks.menuStateChangeMock).toHaveBeenCalledWith(true);
  expect(container?.textContent).toContain('content.toolbar.viewportNativeLabel');
  expect(container?.textContent).toContain('HD');
});
