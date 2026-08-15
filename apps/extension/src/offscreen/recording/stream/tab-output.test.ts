import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCropOutputStream: vi.fn(),
}));

vi.mock('./crop-stream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./crop-stream')>()),
  createCropOutputStream: mocks.createCropOutputStream,
}));

import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { createTabOutputStream, resolveTabOutputGeometry } from './tab-output';

it('passes the canonical contain plan to the gated canvas without a sampling bypass', async () => {
  const stream = {} as MediaStream;
  const geometry = resolveTabOutputGeometry(
    { x: 0, y: 0, width: 1904, height: 985 },
    { width: 2560, height: 1440 },
    { width: 1904, height: 985, devicePixelRatio: 1 },
    {
      frameRateCap: 30,
      resolution: VideoResolutionPreset.SOURCE,
      tracksFullViewport: true,
    }
  );
  const output = { frameRate: 30, stream: {} };
  mocks.createCropOutputStream.mockResolvedValueOnce(output);

  await expect(createTabOutputStream(stream, geometry, { frameRate: 30 })).resolves.toBe(output);

  expect(mocks.createCropOutputStream).toHaveBeenCalledWith(stream, geometry, {
    frameRate: 30,
  });
  expect(geometry).toMatchObject({
    fit: 'contain',
    outputBasis: { width: 1904, height: 985 },
    outputSize: { width: 1904, height: 984 },
    sourceRect: {
      x: 1,
      y: expect.closeTo(59.00420168067228),
      width: 2558,
      height: expect.closeTo(1321.9915966386554),
    },
  });
});
