// @vitest-environment jsdom

import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const designSystemIndexMocks = vi.hoisted(() => ({
  renderPageShellMock: vi.fn(),
}));

vi.mock('../../../ui/page-bootstrap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../ui/page-bootstrap')>();

  return {
    ...actual,
    renderPageShell: designSystemIndexMocks.renderPageShellMock,
  };
});

vi.mock('../page', () => ({
  DesignSystemPage: () => null,
}));

vi.mock('../../theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../theme')>();

  return {
    ...actual,
    DesignSystemThemeSurface: ({ children }: { children: ReactNode }) => children,
  };
});

describe('design-system index entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('renders the design system through the shared shell without theme bootstrap', async () => {
    await import('../..');

    expect(designSystemIndexMocks.renderPageShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initializeTheme: false,
        namespace: 'DesignSystemEntrypoint',
      })
    );
  });
});
