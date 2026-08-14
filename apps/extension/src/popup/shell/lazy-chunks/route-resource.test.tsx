// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { createPreloadableRouteResource } from './route-resource';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('renders a route synchronously after its preload has resolved', async () => {
  const Route = () => <div data-testid="resolved-route" />;
  const loader = vi.fn(async () => Route);
  const resource = createPreloadableRouteResource(loader);

  await resource.preload();

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    const ResolvedRoute = resource.getResolved();
    root.render(ResolvedRoute ? <ResolvedRoute /> : <div data-testid="empty-route" />);
  });

  expect(container.querySelector('[data-testid="resolved-route"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="empty-route"]')).toBeNull();
  expect(loader).toHaveBeenCalledTimes(1);

  act(() => root.unmount());
});

it('shares concurrent loads and retries after a failed speculative preload', async () => {
  const Route = () => null;
  const loader = vi
    .fn<() => Promise<typeof Route>>()
    .mockRejectedValueOnce(new Error('chunk failed'))
    .mockResolvedValue(Route);
  const resource = createPreloadableRouteResource(loader);

  const first = resource.preload();
  expect(resource.preload()).toBe(first);
  await expect(first).rejects.toThrow('chunk failed');

  await expect(resource.preload()).resolves.toBe(Route);
  expect(resource.getResolved()).toBe(Route);
  expect(loader).toHaveBeenCalledTimes(2);
});
