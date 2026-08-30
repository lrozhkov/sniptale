import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function verifyScreenshotSurface({ out, sourceInfo, specName, viewer }) {
  await viewer.getByRole('button', { name: /Screenshot|Скриншот/i }).click();
  const visual = viewer.getByTestId('snapshot-visual-image');
  await visual.waitFor({ state: 'visible', timeout: 30_000 });
  await visual.evaluate((image) => image.decode());
  const visualInfo = await visual.evaluate((image) => ({
    naturalHeight: image.naturalHeight,
    naturalWidth: image.naturalWidth,
    renderedHeight: image.getBoundingClientRect().height,
    renderedWidth: image.getBoundingClientRect().width,
  }));
  const visualSignal = await visual.evaluate((image) => {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    let opaquePixels = 0;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 0) opaquePixels += 1;
      colors.add(
        `${pixels[index] >> 4}:${pixels[index + 1] >> 4}:${pixels[index + 2] >> 4}:${pixels[index + 3] >> 4}`
      );
    }
    return { coarseColorCount: colors.size, opaquePixels };
  });
  const retainedSensitivePixel = sourceInfo.sensitiveProof
    ? await visual.evaluate(
        (image, proof) => {
          const canvas = globalThis.document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          const sourceX = Math.max(
            0,
            Math.min(
              image.naturalWidth - 1,
              Math.round((proof.x * image.naturalWidth) / proof.documentWidth)
            )
          );
          const sourceY = Math.max(
            0,
            Math.min(
              image.naturalHeight - 1,
              Math.round((proof.y * image.naturalHeight) / proof.documentHeight)
            )
          );
          context.drawImage(image, sourceX, sourceY, 1, 1, 0, 0, 1, 1);
          const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
          return { alpha, blue, green, red, sourceX, sourceY };
        },
        {
          ...sourceInfo.sensitiveProof,
          documentHeight: sourceInfo.documentHeight,
          documentWidth: sourceInfo.documentWidth,
        }
      )
    : null;
  const retainedDataUrl = await visual.evaluate(async (image) => {
    const blob = await fetch(image.src).then((response) => response.blob());
    return new Promise((resolve, reject) => {
      const reader = new globalThis.FileReader();
      reader.onerror = () => reject(new Error('Failed to read retained screenshot'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  });
  const retainedBytes = Buffer.from(retainedDataUrl.split(',', 2)[1], 'base64');
  const retainedPath = join(out, `${specName}-retained.png`);
  await writeFile(retainedPath, retainedBytes);

  return { retainedBytes, retainedSensitivePixel, visualInfo, visualSignal };
}
