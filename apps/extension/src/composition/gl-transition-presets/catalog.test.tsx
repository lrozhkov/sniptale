// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createGlTransitionSelection } from '../../features/video/project/transition/gl-catalog';
const mocks = vi.hoisted(() => ({ sources: vi.fn(), builtin: vi.fn(), preferences: vi.fn() }));
vi.mock('../persistence/effect-bundles/gl-presets', async (original) => ({
  ...(await original<typeof import('../persistence/effect-bundles/gl-presets')>()),
  listGlPresetCatalogEntries: mocks.sources,
  listBuiltinGlTransitionAvailability: mocks.builtin,
}));
vi.mock('../persistence/effect-bundles/preferences', async (original) => ({
  ...(await original<typeof import('../persistence/effect-bundles/preferences')>()),
  readVisualCatalogPreferences: mocks.preferences,
}));
import { readGlTransitionCatalog, useGlTransitionCatalog } from './catalog';
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.sources.mockResolvedValue([]);
  mocks.preferences.mockResolvedValue([]);
  mocks.builtin.mockResolvedValue([{ transition: { name: 'Fade' }, enabled: false }]);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function fixture(version = '3.2.0') {
  const selection = createGlTransitionSelection('Fade');
  if (!selection) throw Error('Missing Fade');
  const source = JSON.stringify({
      format: 'sniptale-gl-preset',
      version: 1,
      name: 'Custom',
      transition: { ...selection, version },
    }),
    sha = createHash('sha256').update(source).digest('hex');
  return {
    format: 'sniptale-gl-preset-catalog',
    version: 1,
    id: `gl.${sha}`,
    source,
    sourceSha256: sha,
    retainedByteLength: new TextEncoder().encode(source).byteLength,
    createdAt: 1,
    updatedAt: 1,
  };
}
it('resolves immutable sources and availability while keeping unavailable implementations non-executable', async () => {
  const ready = fixture(),
    future = fixture('99.0.0');
  mocks.sources.mockResolvedValue([ready, future]);
  const items = await readGlTransitionCatalog();
  expect(items[0]).toMatchObject({
    id: ready.id,
    name: 'Custom',
    status: 'ready',
    selection: { name: 'Fade' },
  });
  expect(items[1]).toMatchObject({ id: future.id, status: 'unsupported' });
  expect(Object.hasOwn(items[1]!, 'selection')).toBe(false);
  expect(items[2]).toMatchObject({
    id: 'builtin:Fade',
    builtin: true,
    enabled: false,
    status: 'ready',
  });
});
function Consumer() {
  const catalog = useGlTransitionCatalog();
  return (
    <div data-loading={catalog.loading} data-error={catalog.error}>
      {catalog.items.map((item) => item.id).join(',')}
    </div>
  );
}
it('rejects a late old reload and preserves the latest catalogue', async () => {
  const old = Promise.withResolvers<never[]>();
  mocks.sources.mockReturnValueOnce(old.promise).mockResolvedValueOnce([fixture()]);
  await act(async () => root.render(<Consumer />));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(host.textContent).toContain(fixture().id);
  await act(async () => old.resolve([]));
  expect(host.textContent).toContain(fixture().id);
  expect(host.firstElementChild?.getAttribute('data-loading')).toBe('false');
});
it('exposes read failure without publishing new apply choices and permits retry', async () => {
  mocks.sources.mockRejectedValueOnce(new Error('Storage unavailable'));
  await act(async () => root.render(<Consumer />));
  expect(host.textContent).toBe('');
  expect(host.firstElementChild?.getAttribute('data-error')).toBe('true');
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(host.textContent).toBe('builtin:Fade');
  expect(host.firstElementChild?.getAttribute('data-error')).toBe('false');
});
it('disposes pending reads without reattaching listeners or publishing their result', async () => {
  const held = Promise.withResolvers<never[]>();
  mocks.sources.mockReturnValueOnce(held.promise);
  await act(async () => root.render(<Consumer />));
  act(() => root.render(null));
  await act(async () => held.resolve([]));
  window.dispatchEvent(new Event('focus'));
  expect(mocks.sources).toHaveBeenCalledTimes(1);
  expect(host.textContent).toBe('');
});
