// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const { open } = vi.hoisted(() => ({ open: vi.fn(async () => {}) }));
vi.mock('../../../platform/navigation/extension-pages', async (original) => ({
  ...(await original<typeof import('../../../platform/navigation/extension-pages')>()),
  openSettingsPage: open,
}));
import { EffectImportControl } from './header';
it('opens the effects settings section from the import footer', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<EffectImportControl disabled={false} onImport={vi.fn()} run={vi.fn()} />)
    );
    const button = container.querySelector(
      'button:has(svg.lucide-settings-2)'
    ) as HTMLButtonElement;
    await act(async () => button.click());
    expect(open).toHaveBeenCalledWith({ route: { section: 'video-effects' } });
    expect(container.querySelector('input')?.multiple).toBe(true);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
