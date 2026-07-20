// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const settingsIndexMocks = vi.hoisted(() => ({
  renderPageShellMock: vi.fn(),
}));

vi.mock('../../../ui/page-bootstrap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/page-bootstrap')>()),
  renderPageShell: settingsIndexMocks.renderPageShellMock,
}));

vi.mock('.', () => ({
  SettingsPage: () => null,
}));

describe('settings index entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('renders settings through the shared page shell', async () => {
    await import('../..');

    expect(settingsIndexMocks.renderPageShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'SettingsEntrypoint',
      })
    );
  });
});
