import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

test('retained paint preserves native path coverage, gradients and fractional transforms', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents: `export {rasterizeGpuPreviewPaint} from './apps/extension/src/features/video/composition/canvas/gpu-preview-primitive';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const results = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      const { rasterizeGpuPreviewPaint } = await import(url);
      const results = [];
      for (const scale of [1, 2]) {
        for (const clipped of [false, true]) {
          const matrix = [
            1.0920895338058472, 0.13168342411518097, -0.10175538063049316, 0.8438873887062073, 250,
            180,
          ];
          if (scale === 2) {
            matrix[4] += 0.375;
            matrix[5] += 0.25;
          }
          const full = new OffscreenCanvas(768, 512);
          const reference = full.getContext('2d')!;
          const offset = { x: 118, y: 115 };
          // Use the real lower-third composition bounds, independent of the primitive ROI.
          const width = 571,
            height = 147;
          const local = [...matrix];
          local[4] -= offset.x;
          local[5] -= offset.y;
          if (clipped) {
            reference.beginPath();
            reference.rect(offset.x + 8, offset.y + 7, width - 20, height - 14);
            reference.clip();
          }
          reference.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
          const gradient = reference.createLinearGradient(-90, 0, 90, 0);
          gradient.addColorStop(0, '#ff8800ee');
          gradient.addColorStop(1, '#0088ff77');
          reference.fillStyle = gradient;
          reference.beginPath();
          reference.roundRect(-90, -35, 180, 70, 12);
          reference.fill();
          const paint = {
            ...(clipped
              ? {
                  clips: [
                    {
                      rect: { x: 8, y: 7, width: width - 20, height: height - 14 },
                      transform: [1, 0, 0, 1, 0, 0],
                    },
                  ],
                }
              : {}),
            transform: local,
            path: [{ op: 'roundRect', args: [-90, -35, 180, 70, 12], transform: local }],
            draw: { op: 'fill', args: ['nonzero'] },
            style: {
              fill: {
                kind: 'linear',
                args: [-90, 0, 90, 0],
                transform: local,
                stops: [
                  [0, '#ff8800ee'],
                  [1, '#0088ff77'],
                ],
              },
              stroke: '#000000',
              font: '10px sans-serif',
              lineWidth: 1,
              lineCap: 'butt',
              lineJoin: 'miter',
              miterLimit: 10,
              textAlign: 'start',
              textBaseline: 'alphabetic',
              direction: 'inherit',
            },
          };
          const actual = rasterizeGpuPreviewPaint({ width, height, paint });
          const a = actual.getContext('2d')!.getImageData(0, 0, width, height).data;
          const snapshot = new OffscreenCanvas(width, height);
          const snapshotContext = snapshot.getContext('2d')!;
          snapshotContext.drawImage(full, offset.x, offset.y, width, height, 0, 0, width, height);
          const b = snapshotContext.getImageData(0, 0, width, height).data;
          let maxPremultiplied = 0,
            maxAlpha = 0,
            sum = 0;
          for (let i = 0; i < a.length; i += 4) {
            maxAlpha = Math.max(maxAlpha, Math.abs(a[i + 3] - b[i + 3]));
            for (let c = 0; c < 3; c++) {
              const delta = Math.abs((a[i + c] * a[i + 3]) / 255 - (b[i + c] * b[i + 3]) / 255);
              maxPremultiplied = Math.max(maxPremultiplied, delta);
              sum += delta;
            }
          }
          results.push({
            scale,
            clipped,
            maxPremultiplied,
            maxAlpha,
            mean: sum / (width * height * 3),
          });
          actual.width =
            actual.height =
            full.width =
            full.height =
            snapshot.width =
            snapshot.height =
              0;
        }
      }
      return results;
    } finally {
      URL.revokeObjectURL(url);
    }
  }, bundle.outputFiles[0]!.text);
  await info.attach('native-paint-pixel-differences', {
    body: JSON.stringify(results),
    contentType: 'application/json',
  });
  for (const result of results) {
    // Two RGBA8 rounding steps can differ by two levels after unpremultiply/re-premultiply.
    expect(result.maxPremultiplied, JSON.stringify(result)).toBeLessThanOrEqual(2);
    expect(result.maxAlpha, JSON.stringify(result)).toBeLessThanOrEqual(1);
    expect(result.mean, JSON.stringify(result)).toBeLessThanOrEqual(0.1);
  }
});
