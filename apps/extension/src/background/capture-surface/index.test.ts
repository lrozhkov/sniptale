import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  instances: [] as Array<{ recover: ReturnType<typeof vi.fn> }>,
}));

vi.mock('./service', () => ({
  DefaultCaptureSurfaceService: class {
    readonly recover = vi.fn().mockResolvedValue(undefined);

    constructor() {
      mocks.instances.push(this);
    }
  },
}));

import {
  getCaptureSurfaceService,
  recoverCaptureSurfaces,
  resetCaptureSurfaceServiceForTests,
} from '.';

beforeEach(() => {
  mocks.instances.length = 0;
  resetCaptureSurfaceServiceForTests();
});

it('owns one default capture-surface service until the test reset seam is used', () => {
  expect(getCaptureSurfaceService()).toBe(getCaptureSurfaceService());
  expect(mocks.instances).toHaveLength(1);

  resetCaptureSurfaceServiceForTests();
  expect(getCaptureSurfaceService()).not.toBe(mocks.instances[0]);
  expect(mocks.instances).toHaveLength(2);
});

it('forwards startup recovery with and without live session ids', async () => {
  await recoverCaptureSurfaces();
  expect(mocks.instances[0]?.recover).toHaveBeenCalledWith({});

  const liveSessionIds = new Set(['recording-1']);
  await recoverCaptureSurfaces(liveSessionIds);
  expect(mocks.instances[0]?.recover).toHaveBeenLastCalledWith({ liveSessionIds });
});
