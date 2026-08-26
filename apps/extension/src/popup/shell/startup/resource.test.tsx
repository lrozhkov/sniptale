import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ screenshots: vi.fn(), video: vi.fn(), export: vi.fn() }));

vi.mock('../home/route', () => ({ ScreenshotsRoute: mocks.screenshots }));
vi.mock('../menu/route', () => ({ MenuRoute: vi.fn() }));
vi.mock('../tools/route', () => ({ ToolsRoute: vi.fn() }));
vi.mock('../video/route', () => ({ VideoRoute: mocks.video }));
vi.mock('../export/route', () => ({ ExportRoute: mocks.export }));

beforeEach(() => vi.resetModules());

it('memoizes parallel preload and navigation for one route', async () => {
  const resource = await import('./resource');
  const [first, second] = await Promise.all([
    resource.preloadPopupPage('video'),
    resource.loadPopupRoute({ page: 'video' }),
  ]);
  expect(first).toBe(mocks.video);
  expect(second).toBe(mocks.video);
  expect(await resource.preloadPopupPage('video')).toBe(mocks.video);
});

it('loads only the selected route module', async () => {
  const resource = await import('./resource');
  expect(await resource.loadPopupRoute({ page: 'export' })).toBe(mocks.export);
  expect(mocks.screenshots).not.toHaveBeenCalled();
  expect(mocks.video).not.toHaveBeenCalled();
});
