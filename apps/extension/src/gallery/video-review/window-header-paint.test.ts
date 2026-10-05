// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { paintZoomPreview, computeZoomPreviewArea } from './zoom-preview-paint';
import { drawReviewSceneFrame } from '../../workflows/video-review/render-export';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSceneSize,
} from '../../features/video/review/advanced/scene';

function context() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it.each(['fixed', 'follow-video'] as const)(
  'paints the same joined window in the inspector and export with %s background',
  (zoomBehavior) => {
    const source = { width: 1920, height: 1080 };
    const background = {
      enabled: true as const,
      type: 'solid' as const,
      color: '#123456ff',
      zoomBehavior,
      layout: { padding: 40, cornerRadius: 24 },
    };
    const settings = {
      source,
      background,
      windowHeader: { kind: 'browser' as const, title: 'Test' },
    };
    const output = computeQuickEditSceneSize(settings);
    const header = document.createElement('canvas');
    const video = document.createElement('canvas');
    for (const scale of [1, 1.1, 2, 4])
      for (const center of [0, 0.5, 1]) {
        const camera = { scale, centerX: center, centerY: center };
        const layout = computeQuickEditSceneLayout({ ...settings, output, camera });
        const inspector = context(),
          exporter = context();
        paintZoomPreview(inspector, {
          layout,
          background,
          headerImage: header,
          frame: { image: video, ...source },
          view: 'result',
          camera,
          accent: '#ffffff',
          cornerRadius: 24,
          ...output,
        });
        drawReviewSceneFrame(exporter, {
          canvas: output,
          layout,
          background,
          image: null,
          headerImage: header,
          sample: {
            draw: (target, x, y, width, height) => target.drawImage(video, x, y, width, height),
          },
        });
        expect(vi.mocked(inspector.drawImage).mock.calls).toEqual(
          vi.mocked(exporter.drawImage).mock.calls
        );
        expect(vi.mocked(inspector.roundRect).mock.calls).toEqual(
          vi.mocked(exporter.roundRect).mock.calls
        );
        const [head, frame] = vi.mocked(exporter.drawImage).mock.calls;
        expect(Number(head![2]) + Number(head![4])).toBeCloseTo(Number(frame![2]));
        expect(head![1]).toBe(frame![1]);
        expect(head![3]).toBe(frame![3]);
        if (scale === 1)
          expect(computeZoomPreviewArea(layout, background, output).y).toBeLessThan(0);
      }
  }
);
