export async function compareScreenshots(context, left, right) {
  const page = await context.newPage();
  await page.setContent('<canvas width="1" height="1"></canvas>');
  const result = await page.evaluate(
    async ({ leftUrl, rightUrl }) => {
      const load = (src) =>
        new Promise((resolve, reject) => {
          const image = new globalThis.Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = src;
        });
      const [leftImage, rightImage] = await Promise.all([load(leftUrl), load(rightUrl)]);
      const comparedWidth = Math.min(leftImage.naturalWidth, rightImage.naturalWidth);
      const comparedHeight = Math.min(leftImage.naturalHeight, rightImage.naturalHeight);
      const canvas = globalThis.document.querySelector('canvas');
      const tileHeight = 256;
      canvas.width = comparedWidth;
      canvas.height = tileHeight;
      const drawing = canvas.getContext('2d', { willReadFrequently: true });
      let changed = 0;
      let absoluteDelta = 0;
      for (let top = 0; top < comparedHeight; top += tileHeight) {
        const height = Math.min(tileHeight, comparedHeight - top);
        drawing.clearRect(0, 0, comparedWidth, tileHeight);
        drawing.drawImage(leftImage, 0, top, comparedWidth, height, 0, 0, comparedWidth, height);
        const leftPixels = drawing.getImageData(0, 0, comparedWidth, height).data;
        drawing.clearRect(0, 0, comparedWidth, tileHeight);
        drawing.drawImage(rightImage, 0, top, comparedWidth, height, 0, 0, comparedWidth, height);
        const rightPixels = drawing.getImageData(0, 0, comparedWidth, height).data;
        for (let index = 0; index < leftPixels.length; index += 4) {
          const delta =
            Math.abs(leftPixels[index] - rightPixels[index]) +
            Math.abs(leftPixels[index + 1] - rightPixels[index + 1]) +
            Math.abs(leftPixels[index + 2] - rightPixels[index + 2]);
          absoluteDelta += delta;
          if (delta > 30) changed += 1;
        }
      }
      const comparedPixels = comparedWidth * comparedHeight;
      const totalPixels = Math.max(
        leftImage.naturalWidth * leftImage.naturalHeight,
        rightImage.naturalWidth * rightImage.naturalHeight
      );
      const unmatchedPixels = totalPixels - comparedPixels;
      return {
        changedPixelRatio: (changed + unmatchedPixels) / totalPixels,
        comparedHeight,
        comparedWidth,
        leftHeight: leftImage.naturalHeight,
        leftWidth: leftImage.naturalWidth,
        meanAbsoluteChannelDelta: absoluteDelta / (comparedPixels * 3),
        rightHeight: rightImage.naturalHeight,
        rightWidth: rightImage.naturalWidth,
        unmatchedPixelRatio: unmatchedPixels / totalPixels,
      };
    },
    {
      leftUrl: `data:image/png;base64,${left.toString('base64')}`,
      rightUrl: `data:image/png;base64,${right.toString('base64')}`,
    }
  );
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
