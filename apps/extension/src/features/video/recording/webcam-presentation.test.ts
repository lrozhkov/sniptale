import { expect, it } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  DEFAULT_WEBCAM_APPEARANCE,
  webcamFrameStyle,
  webcamVideoStyle,
} from './webcam-presentation';

it.each([-1, 0, 1])(
  'keeps mirrored framing at horizontal offset %s inside the mask',
  (horizontal) => {
    for (const zoom of [1, 2]) {
      const style = webcamVideoStyle({
        cropOffset: { x: horizontal, y: 0 },
        appearance: { ...DEFAULT_WEBCAM_APPEARANCE, mirror: true, zoom },
      });
      const translation = Number(style.transform.match(/translateX\(([-\d.]+)%\)/)?.[1] ?? 0) / 100;
      const origin = Number(style.transformOrigin.split('%')[0]) / 100;
      const left = origin + translation - zoom * (1 - origin);
      const right = origin + translation + zoom * origin;
      expect(left).toBeLessThanOrEqual(0);
      expect(right).toBeGreaterThanOrEqual(1);
    }
  }
);

it('resolves all page camera silhouettes and preserves legacy geometry', () => {
  const presentation = DEFAULT_VIDEO_SETTINGS.webcamPresentation!;
  expect(webcamFrameStyle(presentation).borderRadius).toBe('50%');
  expect(webcamFrameStyle({ shape: 'rectangle' }).borderRadius).toBe('12px');
  expect(webcamFrameStyle({ shape: 'ellipse' }).borderRadius).toBe('50%');
  const soft = webcamFrameStyle({ shape: 'soft', appearance: DEFAULT_WEBCAM_APPEARANCE });
  expect(soft.clipPath).toMatch(/^polygon\(/);
  expect(soft.clipPath?.split(',')).toHaveLength(128);
  const appearance = {
    ...DEFAULT_WEBCAM_APPEARANCE,
    roundness: 60,
    shadow: false,
    mirror: true,
    zoom: 2,
  };
  expect(webcamFrameStyle({ shape: 'rectangle', appearance })).toEqual({
    borderRadius: '30%',
    filter: undefined,
    clipPath: undefined,
  });
  expect(webcamVideoStyle({ ...presentation, appearance, cropOffset: { x: -1, y: 1 } })).toEqual({
    objectPosition: '0% 100%',
    transform: 'translateX(100%) scale(-2, 2)',
    transformOrigin: '0% 100%',
  });
});
