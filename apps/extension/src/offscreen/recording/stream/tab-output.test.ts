import { expect, it } from 'vitest';

import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { createEmptyStream, createTrackedStream } from '../multi-source/media-stream.test-support';
import { createTabOutputStream, resolveTabOutputGeometry } from './tab-output';

it('passes through a full acquired TAB raster without viewport reprojection', async () => {
  const stream = createTrackedStream({ frameRate: 30, height: 1440, width: 2560 });
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
  await expect(createTabOutputStream(stream, geometry, { frameRate: 30 })).resolves.toEqual({
    frameRate: 30,
    stream,
  });
  expect(geometry).toMatchObject({
    fit: 'contain',
    outputBasis: { width: 2560, height: 1440 },
    outputSize: { width: 2560, height: 1440 },
    sourceRect: {
      x: 0,
      y: 0,
      width: 2560,
      height: 1440,
    },
  });
});

it('passes through an exact full-tab SOURCE track without a canvas resample', async () => {
  const stream = createTrackedStream({ frameRate: 60, height: 1970, width: 3808 });
  const track = stream.track;
  const geometry = resolveTabOutputGeometry(
    { x: 0, y: 0, width: 1904, height: 985 },
    { width: 3808, height: 1970 },
    { width: 1904, height: 985, devicePixelRatio: 2 },
    {
      frameRateCap: 60,
      resolution: VideoResolutionPreset.SOURCE,
      tracksFullViewport: true,
    }
  );

  await expect(createTabOutputStream(stream, geometry, { frameRate: 60 })).resolves.toEqual({
    frameRate: 60,
    stream,
  });
  expect(track.contentHint).toBe('detail');
});

it('keeps an exact preset-sized full TAB on the encoder-adjacent transform path', async () => {
  const stream = createTrackedStream({ frameRate: 30, height: 1080, width: 1920 });
  const geometry = resolveTabOutputGeometry(
    { x: 0, y: 0, width: 1920, height: 1080 },
    { width: 1920, height: 1080 },
    { width: 1920, height: 1080, devicePixelRatio: 1 },
    {
      frameRateCap: 30,
      resolution: VideoResolutionPreset.P1080,
      tracksFullViewport: true,
    }
  );
  await expect(createTabOutputStream(stream, geometry, { frameRate: 30 })).resolves.toEqual({
    frameRate: 30,
    frameTransform: {
      fit: 'fill',
      outputSize: { height: 1080, width: 1920 },
      sourceRect: { height: 1080, width: 1920, x: 0, y: 0 },
    },
    stream,
  });
});

it('keeps exact full SOURCE pass-through independent of optional track FPS metadata', async () => {
  const stream = createTrackedStream({ frameRate: 60, height: 1080, width: 1920 });
  const geometry = resolveTabOutputGeometry(
    { x: 0, y: 0, width: 1920, height: 1080 },
    { width: 1920, height: 1080 },
    { width: 1920, height: 1080, devicePixelRatio: 1 },
    {
      frameRateCap: 24,
      resolution: VideoResolutionPreset.SOURCE,
      tracksFullViewport: true,
    }
  );
  await expect(createTabOutputStream(stream, geometry, { frameRate: 24 })).resolves.toEqual({
    frameRate: 24,
    stream,
  });
});

it('uses an encoder-visible crop for an odd native full SOURCE without a canvas transform', async () => {
  const stream = createTrackedStream({ frameRate: 60, height: 1081, width: 1920 });
  const geometry = resolveTabOutputGeometry(
    { x: 0, y: 0, width: 1920, height: 1081 },
    { width: 1920, height: 1081 },
    { width: 1920, height: 1081, devicePixelRatio: 1 },
    {
      frameRateCap: 60,
      resolution: VideoResolutionPreset.SOURCE,
      tracksFullViewport: true,
    }
  );

  await expect(createTabOutputStream(stream, geometry, { frameRate: 60 })).resolves.toEqual({
    frameRate: 60,
    frameTransform: {
      fit: 'fill',
      outputSize: { height: 1080, width: 1920 },
      sourceRect: { x: 0, y: 0, width: 1920, height: 1080 },
    },
    stream,
  });
});

it('rejects a TAB source without a video track before selecting a pipeline', async () => {
  const geometry = resolveTabOutputGeometry(
    { x: 0, y: 0, width: 1920, height: 1080 },
    { width: 1920, height: 1080 },
    { width: 1920, height: 1080, devicePixelRatio: 1 },
    {
      frameRateCap: 30,
      resolution: VideoResolutionPreset.SOURCE,
      tracksFullViewport: true,
    }
  );

  await expect(createTabOutputStream(createEmptyStream(), geometry)).rejects.toThrow(
    'Tab source stream returned no video track'
  );
});
