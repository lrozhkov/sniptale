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
      return { peak, variation, sharpPeak, frames, translucent, outside };
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
