import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('decorated video keeps subpixel edges and an opaque join through slow zoom links', async ({
  page,
}, info) => {
  const bundle = await build({
    entryPoints: ['tooling/test/e2e/support/header-motion-probe.tsx'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text', '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const moduleUrl = await page.evaluate(
    (text) => URL.createObjectURL(new Blob([text], { type: 'text/javascript' })),
    bundle.outputFiles[0]!.text
  );
  const encoded = (await readFile('tooling/test/e2e/fixtures/review-vp8-opus.webm')).toString(
    'base64'
  );
  const url = `data:video/webm;base64,${encoded}`;
  await page.evaluate(async ({ moduleUrl, url }) => (await import(moduleUrl)).show(url, 2, false), {
    moduleUrl,
    url,
  });
  await page.waitForFunction(
    () =>
      document.querySelector('img')?.complete &&
      (document.querySelector('video')?.readyState ?? 0) >= 2
  );
  const metrics = [];
  for (const follows of [false, true]) {
    for (const time of [0, 2.013, 4.017, 8.031, 12]) {
      const boxes = await page.evaluate(
        async (args) => (await import(args.moduleUrl)).show(args.url, args.time, args.follows),
        { moduleUrl, url, time, follows }
      );
      const screenshot = await page.screenshot({
        path: info.outputPath(`join-${follows}-${time}.png`),
        fullPage: false,
      });
      const pixels = await page.evaluate(
        async ({ encoded, boxes }) => {
          const image = new Image();
          image.src = `data:image/png;base64,${encoded}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          const y = Math.floor(boxes.video.y);
          return [-1, 0, 1].map((dy) =>
            Array.from(
              context.getImageData(Math.round(boxes.video.x + boxes.video.width / 2), y + dy, 1, 1)
                .data
            )
          );
        },
        { encoded: screenshot.toString('base64'), boxes }
      );
      metrics.push({ follows, time, boxes, pixels });
      expect.soft(Math.abs(boxes.header.x - boxes.video.x)).toBeLessThan(0.005);
      expect.soft(Math.abs(boxes.header.width - boxes.video.width)).toBeLessThan(0.005);
      expect.soft(Math.abs(boxes.header.bottom - boxes.video.top)).toBeLessThan(0.005);
      for (const pixel of pixels)
        expect.soft(pixel[0]! - pixel[1]!, JSON.stringify(metrics)).toBeLessThan(30);
    }
  }
  for (const follows of [false, true]) {
    const frames = await page.evaluate(
      async (args) => (await import(args.moduleUrl)).motion(args.url, args.follows),
      { moduleUrl, url, follows }
    );
    expect(new Set(frames.map((frame: { headerWidth: string }) => frame.headerWidth)).size).toBe(1);
    const widths = frames.map((frame: { video: { width: number } }) => frame.video.width);
    const step = (widths.at(-1)! - widths[0]!) / (widths.length - 1);
    for (let i = 1; i < widths.length; i++)
      expect(Math.abs(widths[i]! - widths[i - 1]! - step)).toBeLessThan(0.005);
  }
  await writeFile(info.outputPath('geometry.json'), JSON.stringify(metrics, null, 2));
});
