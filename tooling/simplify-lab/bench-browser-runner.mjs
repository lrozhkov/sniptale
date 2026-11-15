import { createCanvas, loadImage } from 'canvas';
import { chromium } from 'playwright';
import { startLab } from './server.mjs';

function checkAbort(signal) {
  if (signal?.aborted)
    throw Object.assign(new Error('Benchmark was cancelled.'), { classification: 'cancelled' });
}
function pngBytes(dataUrl) {
  if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,[a-zA-Z0-9+/]+={0,2}$/.test(dataUrl))
    throw new Error('Expected a PNG data URL.');
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}
async function decodePng(bytes, width, height) {
  const image = await loadImage(Buffer.from(bytes));
  if (image.width !== width || image.height !== height)
    throw new Error('Decoded PNG size differs.');
  const canvas = createCanvas(width, height);
  try {
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return new Uint8Array(context.getImageData(0, 0, width, height).data);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
function encodePng(pixels, width, height) {
  const canvas = createCanvas(width, height);
  try {
    const context = canvas.getContext('2d'),
      image = context.createImageData(width, height);
    image.data.set(pixels);
    context.putImageData(image, 0, 0);
    return canvas.toBuffer('image/png');
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
/** Own the lab, Chromium and Worker lifetime; transfer PNG bytes instead of expanded pixel arrays. */
export async function createBrowserRunner({
  manifestPath,
  signal,
  start = startLab,
  launch = () => chromium.launch({ headless: true, chromiumSandbox: true }),
}) {
  let lab, browser, page;
  async function close() {
    try {
      await page
        ?.evaluate(async () => {
          const { compute } = await import('/generated/adapter.mjs');
          compute.dispose();
        })
        .catch(() => {});
    } finally {
      try {
        await browser?.close();
      } finally {
        await lab?.close();
      }
    }
  }
  try {
    checkAbort(signal);
    lab = await start({ corpus: manifestPath });
    checkAbort(signal);
    browser = await launch();
    checkAbort(signal);
    page = await browser.newPage({ viewport: { width: 1280, height: 560 }, deviceScaleFactor: 1 });
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === new URL(lab.url).origin
        ? route.continue()
        : route.abort()
    );
    await page.goto(`${lab.url}/config.json`);
    checkAbort(signal);
    return {
      engineHash: lab.config.stamp.sourceDigest,
      decodePng,
      encodePng,
      async render(input) {
        checkAbort(signal);
        const result = await page.evaluate(async ({ source, region, settings }) => {
          const { compute } = await import('/generated/adapter.mjs');
          const result = await compute.render({ source, region, settings });
          return {
            dataUrl: result.dataUrl,
            width: result.width,
            height: result.height,
            version: result.version,
          };
        }, input);
        checkAbort(signal);
        const { source, region } = input;
        if (result.width !== region.width || result.height !== region.height)
          throw new Error('Worker ROI size differs.');
        const [original, processed] = await Promise.all([
          decodePng(pngBytes(source.dataUrl), source.width, source.height),
          decodePng(pngBytes(result.dataUrl), region.width, region.height),
        ]);
        checkAbort(signal);
        const output = new Uint8Array(original);
        for (let row = 0; row < region.height; row++)
          output.set(
            processed.subarray(row * region.width * 4, (row + 1) * region.width * 4),
            ((region.y + row) * source.width + region.x) * 4
          );
        return { output, version: result.version };
      },
      cancel: () =>
        page
          .evaluate(async () => {
            const { compute } = await import('/generated/adapter.mjs');
            compute.cancel();
          })
          .catch(() => {}),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
