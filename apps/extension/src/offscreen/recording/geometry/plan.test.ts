import { describe, expect, it } from 'vitest';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import { createRecordingGeometryPlan, remapRecordingGeometryPlan } from './plan';

describe('recording geometry plan', () => {
  it.each([
    [{ height: 985, width: 1904 }, VideoResolutionPreset.SOURCE, { height: 984, width: 1904 }],
    [{ height: 500, width: 1086 }, VideoResolutionPreset.P1080, { height: 500, width: 1086 }],
    [{ height: 1920, width: 1080 }, VideoResolutionPreset.P480, { height: 480, width: 270 }],
    [{ height: 400, width: 2400 }, VideoResolutionPreset.P1440, { height: 400, width: 2400 }],
  ])(
    'resolves a screen-recording encoder canvas without upscaling the source',
    (basis, resolution, output) => {
      const plan = createRecordingGeometryPlan({
        frameRateCap: 30,
        outputBasis: basis,
        presetScaleMode: 'avoid-upscale',
        resolution,
        sourceRect: { x: 0, y: 0, ...basis },
      });

      expect(plan).toMatchObject({ fit: 'contain', frameRateCap: 30, outputSize: output });
      expect(Object.isFrozen(plan)).toBe(true);
      expect(Object.isFrozen(plan.outputBasis)).toBe(true);
      expect(Object.isFrozen(plan.outputSize)).toBe(true);
      expect(Object.isFrozen(plan.sourceRect)).toBe(true);
    }
  );

  it('keeps fixed-output preset scaling by default', () => {
    const plan = createRecordingGeometryPlan({
      frameRateCap: 30,
      outputBasis: { height: 500, width: 1086 },
      resolution: VideoResolutionPreset.P1080,
      sourceRect: { x: 0, y: 0, height: 500, width: 1086 },
    });

    expect(plan.outputSize).toEqual({ height: 1080, width: 2346 });
  });

  it('removes only an odd physical edge for a one-to-one SOURCE sample', () => {
    const plan = createRecordingGeometryPlan({
      frameRateCap: 30,
      outputBasis: { height: 721, width: 1279 },
      resolution: VideoResolutionPreset.SOURCE,
      sourceRect: { x: 0, y: 0, height: 721, width: 1279 },
    });

    expect(plan.outputSize).toEqual({ height: 720, width: 1278 });
    expect(plan.sourceRect).toEqual({ x: 0, y: 0, height: 720, width: 1278 });
  });

  it('preserves output basis and canvas while replacing only the physical sample', () => {
    const initial = createRecordingGeometryPlan({
      frameRateCap: 24,
      outputBasis: { height: 985, width: 1904 },
      resolution: VideoResolutionPreset.SOURCE,
      sourceRect: { x: 0, y: 58, height: 1324, width: 2560 },
    });
    const resized = remapRecordingGeometryPlan(initial, {
      x: 0,
      y: 0,
      height: 1440,
      width: 2560,
    });

    expect(resized).not.toBe(initial);
    expect(resized.outputBasis).toBe(initial.outputBasis);
    expect(resized.outputSize).toBe(initial.outputSize);
    expect(resized).toMatchObject({
      fit: 'contain',
      frameRateCap: 24,
      outputSize: { height: 984, width: 1904 },
      sourceRect: { x: 0, y: 0, height: 1440, width: 2560 },
    });
  });
});
