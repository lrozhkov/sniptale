import { DEFAULT_WINDOW_HEADER } from '../../../browser-frame/header';
import { expect, it } from 'vitest';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSceneSize,
  computeQuickEditWindowTransform,
  evaluateQuickEditCameraAtTime,
} from './scene';
import { createQuickEditZoomRegion } from './zoom';
import type { QuickEditBackgroundSettings } from './types';

it.each(['fixed', 'follow-video'] as const)(
  'reaches every decorated-window edge at maximum zoom with %s background',
  (zoomBehavior) => {
    for (const source of [
      { width: 1920, height: 1080 },
      { width: 160, height: 90 },
      { width: 1200, height: 200 },
    ]) {
      for (const canvas of [source, { width: 900, height: 1600 }]) {
        const background: QuickEditBackgroundSettings = {
          enabled: true,
          type: 'solid',
          color: '#123456ff',
          zoomBehavior,
          layout: { padding: 40, cornerRadius: 24, shadow: { intensity: 40, color: '#000000ff' } },
        };
        for (const windowHeader of [
          { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: '' },
          undefined,
          { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: '' },
        ]) {
          const settings = { source, canvas, background, windowHeader };
          const output = computeQuickEditSceneSize(settings);
          for (const scale of [1, 1.01, 2, 4]) {
            for (const center of [0, 0.5, 1]) {
              const layout = computeQuickEditSceneLayout({
                ...settings,
                output,
                camera: { scale, centerX: center, centerY: center },
              });
              const actual = computeQuickEditWindowTransform(layout);
              const original = layout.windowRect;
              if (center === 0 || scale === 1) {
                expect(actual.x).toBeCloseTo(original.x);
                expect(actual.y).toBeCloseTo(original.y);
              }
              if (center === 1 || scale === 1) {
                expect(actual.x + actual.width).toBeCloseTo(original.x + original.width);
                expect(actual.y + actual.height).toBeCloseTo(original.y + original.height);
              }
              if (center === 0.5) {
                expect(actual.y + actual.height / 2).toBeCloseTo(original.y + original.height / 2);
              }
              expect(actual.width).toBeCloseTo(original.width * scale);
              expect(actual.height).toBeCloseTo(original.height * scale);
            }
          }
        }
      }
    }
  }
);

it('keeps the header top stationary while animating a top-edge target', () => {
  const region = {
    ...createQuickEditZoomRegion({ id: 'top', at: 0, duration: 4 }),
    transform: { scale: 4, centerX: 0, centerY: 0 },
  };
  const settings = {
    source: { width: 1920, height: 1080 },
    background: { enabled: false } as const,
    windowHeader: { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: '' },
  };
  const output = computeQuickEditSceneSize(settings);
  for (const time of [0, 0.05, 0.1, 0.2, 1, 3.9]) {
    const layout = computeQuickEditSceneLayout({
      ...settings,
      output,
      camera: evaluateQuickEditCameraAtTime([region], time),
    });
    expect(computeQuickEditWindowTransform(layout).y).toBeCloseTo(layout.windowRect.y);
  }
});
