import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const browserComparisonScript = join(
  dirname(fileURLToPath(import.meta.url)),
  'pixel-comparison-browser.js'
);

export async function compareScreenshots(context, left, right, options = {}) {
  const page = await context.newPage();
  await page.setContent('<canvas width="1" height="1"></canvas>');
  await page.addScriptTag({ path: browserComparisonScript });
  const result = await page.evaluate((args) => globalThis.runSmokePixelComparison(args), {
    leftUrl: `data:image/png;base64,${left.toString('base64')}`,
    createDiff: options.createDiff === true,
    normalizeDimensions: options.normalizeDimensions === true,
    rightUrl: `data:image/png;base64,${right.toString('base64')}`,
  });
  await page.close();
  return result;
}

export async function cropScreenshot(context, imageBytes, width, height) {
  const page = await context.newPage();
  await page.setContent('<canvas width="1" height="1"></canvas>');
  const croppedDataUrl = await page.evaluate(
    async ({ imageUrl, outputHeight, outputWidth }) => {
      const image = await new Promise((resolve, reject) => {
        const candidate = new globalThis.Image();
        candidate.onload = () => resolve(candidate);
        candidate.onerror = reject;
        candidate.src = imageUrl;
      });
      const canvas = globalThis.document.querySelector('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/png');
    },
    {
      imageUrl: `data:image/png;base64,${Buffer.from(imageBytes).toString('base64')}`,
      outputHeight: height,
      outputWidth: width,
    }
  );
  await page.close();
  return Buffer.from(croppedDataUrl.split(',', 2)[1], 'base64');
}
