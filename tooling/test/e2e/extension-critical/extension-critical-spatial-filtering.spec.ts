import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('perspective filters subpixel rules and depth blur without moving line copies', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents: `export { createReviewSpatialRenderer } from './apps/extension/src/workflows/video-review/spatial-renderer';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const metrics = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    const { createReviewSpatialRenderer } = await import(url);
    URL.revokeObjectURL(url);
    const renderer = createReviewSpatialRenderer();
    const width = 962,
      height = 586;
    const rect = { x: 0, y: 0, width, height };
    const plane = renderer.surface('plane', width, height);
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    document.body.append(output);
    const context = output.getContext('2d')!;
    const focus = [
      {
        weight: 1,
        settings: {
          enabled: true,
          mode: 'area',
          x: 0,
          y: 0,
          width: 0,
          softness: 0.01,
          strength: 1,
        },
      },
    ];
    const draw = (angle: number, blur: boolean, sharp = false) => {
      const radians = (angle * Math.PI) / 360;
      context.clearRect(0, 0, width, height);
      renderer.draw(
        context,
        plane.canvas,
        rect,
        rect,
        {
          rotation: [Math.sin(radians), 0, 0, Math.cos(radians)],
          perspective: 1,
          windowMotion: 1,
          lockBackground: true,
          focus: blur ? focus : [],
        },
        sharp
      );
    };
    try {
      plane.context.fillStyle = 'white';
      plane.context.fillRect(0, 0, width, height);
      plane.context.fillStyle = 'black';
      plane.context.fillRect(0, 293, width, 1);
      draw(0, true);
      const profile = context.getImageData(480, 268, 1, 51).data;
      const darkness = Array.from({ length: 51 }, (_, i) => 255 - profile[i * 4]!);
      const peak = Math.max(...darkness);
      const variation = darkness
        .slice(1)
        .reduce((sum, value, i) => sum + Math.abs(value - darkness[i]!), 0);
      draw(0, true, true);
      const sharpPeak = 255 - context.getImageData(480, 293, 1, 1).data[0]!;
      plane.context.fillStyle = 'white';
      plane.context.fillRect(0, 0, width, height);
      plane.context.fillStyle = 'black';
      for (let y = 0; y < height; y += 2) plane.context.fillRect(0, y, width, 1);
      const frames = [];
      for (const blur of [false, true]) {
        for (const angle of [57, 57.25, 57.5, 57.75, 58]) {
          draw(angle, blur);
          const data = context.getImageData(450, 270, 64, 40).data;
          const values = Array.from({ length: data.length / 4 }, (_, i) => data[i * 4]!);
          const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
          const rms = Math.sqrt(
            values.reduce((sum, value) => sum + (value - 127.5) ** 2, 0) / values.length
          );
          frames.push({ blur, angle, mean, rms });
        }
      }
      plane.context.clearRect(0, 0, width, height);
      plane.context.fillStyle = 'rgba(255, 0, 0, 0.5)';
      plane.context.fillRect(250, 150, 400, 300);
      draw(35, true);
      const translucent = Array.from(context.getImageData(480, 293, 1, 1).data);
      const outside = context.getImageData(20, 20, 1, 1).data[3]!;
      const originalExtension = WebGLRenderingContext.prototype.getExtension;
      WebGLRenderingContext.prototype.getExtension = function (name: string) {
        return name === 'OES_texture_half_float' ? null : originalExtension.call(this, name);
      };
      let fallbackAlpha = 0,
        depthRejected = false;
      try {
        const fallback = createReviewSpatialRenderer();
        const frame = {
          rotation: [0, 0, 0, 1],
          perspective: 0.5,
          windowMotion: 1,
          lockBackground: true,
          focus: [],
        };
        try {
          context.clearRect(0, 0, width, height);
          fallback.draw(context, plane.canvas, rect, rect, frame);
          fallbackAlpha = context.getImageData(480, 293, 1, 1).data[3]!;
          try {
            fallback.draw(context, plane.canvas, rect, rect, { ...frame, focus });
          } catch (error) {
            depthRejected = error instanceof Error && error.message.includes('precision');
          }
        } finally {
          fallback.dispose();
        }
      } finally {
        WebGLRenderingContext.prototype.getExtension = originalExtension;
      }
      return {
        peak,
        variation,
        sharpPeak,
        frames,
        translucent,
        outside,
        fallbackAlpha,
        depthRejected,
      };
    } finally {
      renderer.dispose();
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('filter-metrics.json'), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: info.outputPath('filtered-lines.png'), fullPage: false });
  expect(metrics.translucent[0]).toBeGreaterThan(250);
  expect(metrics.translucent[1]).toBe(0);
  expect(metrics.translucent[3]).toBeGreaterThanOrEqual(126);
  expect(metrics.translucent[3]).toBeLessThanOrEqual(129);
  expect(metrics.outside).toBe(0);
  expect(metrics.fallbackAlpha).toBeGreaterThanOrEqual(126);
  expect(metrics.depthRejected).toBe(true);
  expect.soft(metrics.peak).toBeLessThan(32);
  expect.soft(metrics.variation).toBeLessThan(65);
  expect.soft(metrics.sharpPeak).toBeGreaterThan(240);
  // The area average of equal-width black/white rules is 127.5. Subpixel rules
  // should converge to it rather than produce bands whose brightness changes with angle.
  for (const blur of [false, true]) {
    const means = metrics.frames.filter((frame) => frame.blur === blur).map((frame) => frame.mean);
    expect(Math.max(...means) - Math.min(...means)).toBeLessThan(2.5);
  }
  for (const frame of metrics.frames)
    expect.soft(frame.rms, JSON.stringify(frame)).toBeLessThan(12);
});

test('a straight faint rule keeps its center across a spatially varying depth blur', async ({
  page,
}, info) => {
  const bundle = await build({
    stdin: {
      contents: `export { createReviewSpatialRenderer } from './apps/extension/src/workflows/video-review/spatial-renderer'; export {quickEditPlaneProjection, projectQuickEditPoint} from './apps/extension/src/features/video/review/advanced/spatial-geometry';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  const metrics = await page.evaluate(async (text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    const { createReviewSpatialRenderer, quickEditPlaneProjection, projectQuickEditPoint } =
      await import(url);
    URL.revokeObjectURL(url);
    const renderer = createReviewSpatialRenderer();
    const width = 1920,
      height = 1172;
    const rect = { x: 0, y: 0, width, height };
    const plane = renderer.surface('plane', width, height);
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    document.body.append(output);
    const context = output.getContext('2d')!;
    const results = [];
    try {
      for (const row of [400, 401, 402, 403])
        for (const scale of [1, 1.3]) {
          plane.context.fillStyle = 'white';
          plane.context.fillRect(0, 0, width, height);
          plane.context.fillStyle = '#ddd';
          plane.context.fillRect(0, row, width, 1);
          const angle = scale === 1 ? 0 : (20 * Math.PI) / 360;
          const frame = {
            rotation: [0, Math.sin(angle), 0, Math.cos(angle)],
            perspective: 1,
            windowMotion: 1,
            lockBackground: true,
            focus: [
              {
                weight: 1,
                settings: {
                  enabled: true,
                  mode: 'area',
                  x: 0,
                  y: (row + 0.5) / height,
                  width: 0.1,
                  softness: 0.8,
                  strength: 1,
                },
              },
            ],
          };
          const target = {
            x: (width * (1 - scale)) / 2,
            y: (height * (1 - scale)) / 2,
            width: width * scale,
            height: height * scale,
          };
          context.clearRect(0, 0, width, height);
          renderer.draw(context, plane.canvas, rect, target, frame);
          const projection = quickEditPlaneProjection(rect, target, frame);
          const a = projectQuickEditPoint(projection, { x: 0, y: row + 0.5 });
          const b = projectQuickEditPoint(projection, { x: width, y: row + 0.5 });
          const data = context.getImageData(0, 0, width, height).data;
          const offsets = [];
          for (let x = 300; x < 1600; x += 4) {
            const expected = a.y + ((x + 0.5 - a.x) * (b.y - a.y)) / (b.x - a.x);
            let mass = 0,
              moment = 0;
            for (let y = Math.floor(expected) - 80; y < expected + 80; y++) {
              const darkness = 255 - data[(y * width + x) * 4]!;
              mass += darkness;
              moment += darkness * (y + 0.5 - expected);
            }
            offsets.push(mass ? moment / mass : 100);
          }
          results.push({ row, scale, maximum: Math.max(...offsets.map(Math.abs)), offsets });
        }
      return results;
    } finally {
      renderer.dispose();
    }
  }, bundle.outputFiles[0]!.text);
  await writeFile(info.outputPath('line-centroid.json'), JSON.stringify(metrics, null, 2));
  await page.screenshot({ path: info.outputPath('line-centroid.png'), fullPage: false });
  for (const result of metrics)
    expect
      .soft(result.maximum, `source row ${result.row}, scale ${result.scale}`)
      .toBeLessThanOrEqual(result.scale === 1 ? 0.5 : 1);
});
