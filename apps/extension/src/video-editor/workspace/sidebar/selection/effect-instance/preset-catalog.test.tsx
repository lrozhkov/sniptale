// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useEffectPresetCatalog } from './preset-catalog';
const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../../../../composition/persistence/effect-bundles', async (original) => ({
  ...(await original<typeof import('../../../../../composition/persistence/effect-bundles')>()),
  listEffectBundles: mocks.list,
}));
it('selects preferences by catalog origin even when imported and builtin document hashes match', async () => {
  const row = (packId: string) => ({
    status: 'ready',
    packId,
    source: packId.startsWith('builtin:') ? 'builtin' : 'bundle-zip',
    entry: { packId, documents: [{ id: 'same', sha256: 'same-hash' }] },
  });
  mocks.list.mockResolvedValue([row('builtin:base'), row('imported')]);
  const host = document.createElement('div');
  const root = createRoot(host);
  function View({ origin }: { origin?: string }) {
    const state = useEffectPresetCatalog('same', 'same-hash', origin);
    return <span>{state.catalog?.packId}</span>;
  }
  try {
    await act(async () => {
      root.render(<View origin="builtin:base" />);
    });
    expect(host.textContent).toBe('builtin:base');
    await act(async () => {
      root.render(<View origin="imported" />);
    });
    expect(host.textContent).toBe('imported');
    await act(async () => {
      root.render(<View origin="missing" />);
    });
    expect(host.textContent).toBe('');
    await act(async () => {
      root.render(<View />);
    });
    expect(host.textContent).toBe('imported');
  } finally {
    await act(async () => root.unmount());
  }
});
