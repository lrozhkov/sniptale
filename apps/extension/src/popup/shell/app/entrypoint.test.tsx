// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mark: vi.fn(),
  renderPageShell: vi.fn(),
}));

vi.mock('../../../ui/page-bootstrap/page-bootstrap', () => ({
  renderPageShell: mocks.renderPageShell,
}));

vi.mock('./index', () => ({ PopupApp: () => null }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="root"></div>';
  vi.spyOn(performance, 'mark').mockImplementation(mocks.mark);
});

it('renders the real React shell synchronously from the entry module', async () => {
  await import('../..');

  expect(mocks.mark).toHaveBeenCalledWith('sniptale-popup-entry-evaluated');
  expect(mocks.renderPageShell).toHaveBeenCalledWith({
    element: expect.anything(),
    initializeTheme: false,
    namespace: 'popup',
  });
});

it('does not wait for synchronous theme initialization before rendering', async () => {
  await import('../..');

  expect(mocks.renderPageShell).toHaveBeenCalledOnce();
  expect(mocks.renderPageShell.mock.calls[0]?.[0]).toMatchObject({ initializeTheme: false });
});
