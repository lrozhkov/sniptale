// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ openScreenshotMode: vi.fn(), tools: vi.fn() }));

vi.mock('../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));
vi.mock('../tab-access/capabilities', () => ({
  useActiveTabCapabilities: () => ({ screenshotMode: { reason: null } }),
}));
vi.mock('../navigation/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../navigation/actions')>()),
  openScreenshotMode: mocks.openScreenshotMode,
}));
vi.mock('./panel', () => ({
  PopupToolsPanel: (props: { onOpen(mode: 'drawing'): void }) => {
    mocks.tools(props);
    return <button onClick={() => props.onOpen('drawing')}>drawing</button>;
  },
}));

it('opens the toolbar in the selected tool mode', async () => {
  mocks.openScreenshotMode.mockResolvedValue(undefined);
  const { ToolsRoute } = await import('./route');
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<ToolsRoute />));

  await act(async () => container.querySelector('button')?.click());

  expect(mocks.openScreenshotMode).toHaveBeenCalledWith('drawing');
  expect(container.textContent).not.toContain('popup.home.toolsPageTitle');
  expect(container.textContent).toContain('popup.home.toolsIntroDescription');
  act(() => root.unmount());
});

it('shows the localized owner error when opening a tool fails', async () => {
  mocks.openScreenshotMode.mockRejectedValue('failed');
  const { ToolsRoute } = await import('./route');
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<ToolsRoute />));

  await act(async () => container.querySelector('button')?.click());

  expect(container.textContent).toContain('popup.home.openPrepError');
  act(() => root.unmount());
});

it('shows a concrete toolbar error message', async () => {
  mocks.openScreenshotMode.mockRejectedValue(new Error('Toolbar unavailable'));
  const { ToolsRoute } = await import('./route');
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<ToolsRoute />));

  await act(async () => container.querySelector('button')?.click());

  expect(container.textContent).toContain('Toolbar unavailable');
  act(() => root.unmount());
});
