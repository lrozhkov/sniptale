function loadSmokeImage(source) {
  return new Promise((resolve, reject) => {
    const image = new globalThis.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function drawSmokeComparisonTile(args) {
  args.drawing.clearRect(0, 0, args.sampledWidth, args.tileHeight);
  if (args.normalizeDimensions) {
    args.drawing.drawImage(args.image, 0, -args.top, args.sampledWidth, args.sampledHeight);
  } else {
    args.drawing.drawImage(
      args.image,
      0,
      args.top / args.sampleScale,
      args.comparedWidth,
      args.height / args.sampleScale,
      0,
      0,
      args.sampledWidth,
      args.height
    );
  }
  return args.drawing.getImageData(0, 0, args.sampledWidth, args.height).data;
}

function compareSmokePixelRows(leftPixels, rightPixels, diffPixels) {
  let absoluteDelta = 0;
  let changed = 0;
  for (let index = 0; index < leftPixels.length; index += 4) {
    const delta =
      Math.abs(leftPixels[index] - rightPixels[index]) +
      Math.abs(leftPixels[index + 1] - rightPixels[index + 1]) +
      Math.abs(leftPixels[index + 2] - rightPixels[index + 2]);
    absoluteDelta += delta;
    if (delta > 30) changed += 1;
    if (!diffPixels) continue;
    const changedPixel = delta > 30;
    diffPixels.data[index] = changedPixel ? 239 : Math.round(leftPixels[index] * 0.25);
    diffPixels.data[index + 1] = changedPixel ? 68 : Math.round(leftPixels[index + 1] * 0.25);
    diffPixels.data[index + 2] = changedPixel ? 68 : Math.round(leftPixels[index + 2] * 0.25);
    diffPixels.data[index + 3] = 255;
  }
  return { absoluteDelta, changed };
}

function createSmokeComparisonCanvases(sampledWidth, sampledHeight, createDiff) {
  const canvas = globalThis.document.querySelector('canvas');
  canvas.width = sampledWidth;
  canvas.height = 256;
  const diffCanvas = createDiff ? globalThis.document.createElement('canvas') : null;
  if (diffCanvas) {
    diffCanvas.width = sampledWidth;
    diffCanvas.height = sampledHeight;
  }
  return {
    canvas,
    diffCanvas,
    diffDrawing: diffCanvas?.getContext('2d'),
    drawing: canvas.getContext('2d', { willReadFrequently: true }),
  };
}

function createSmokeComparisonResult(args) {
  const sampledPixels = args.sampledWidth * args.sampledHeight;
  const comparedPixels = args.comparedWidth * args.comparedHeight;
  const totalPixels = args.normalizeDimensions
    ? comparedPixels
    : Math.max(
        args.leftImage.naturalWidth * args.leftImage.naturalHeight,
        args.rightImage.naturalWidth * args.rightImage.naturalHeight
      );
  const unmatchedPixelRatio = (totalPixels - comparedPixels) / totalPixels;
  return {
    changedPixelRatio:
      (args.changed / sampledPixels) * (comparedPixels / totalPixels) + unmatchedPixelRatio,
    comparedHeight: args.comparedHeight,
    comparedWidth: args.comparedWidth,
    diffPngBase64: args.diffCanvas?.toDataURL('image/png').split(',', 2)[1] ?? null,
    leftHeight: args.leftImage.naturalHeight,
    leftWidth: args.leftImage.naturalWidth,
    meanAbsoluteChannelDelta: args.absoluteDelta / (sampledPixels * 3),
    normalizedDimensions: args.normalizeDimensions,
    rightHeight: args.rightImage.naturalHeight,
    rightWidth: args.rightImage.naturalWidth,
    sampleScale: args.sampleScale,
    sampledHeight: args.sampledHeight,
    sampledWidth: args.sampledWidth,
    unmatchedPixelRatio,
  };
}

globalThis.runSmokePixelComparison = async (args) => {
  const [leftImage, rightImage] = await Promise.all([
    loadSmokeImage(args.leftUrl),
    loadSmokeImage(args.rightUrl),
  ]);
  const comparedWidth = args.normalizeDimensions
    ? rightImage.naturalWidth
    : Math.min(leftImage.naturalWidth, rightImage.naturalWidth);
  const comparedHeight = args.normalizeDimensions
    ? rightImage.naturalHeight
    : Math.min(leftImage.naturalHeight, rightImage.naturalHeight);
  const sampleScale = Math.min(
    1,
    Math.sqrt(4_000_000 / Math.max(1, comparedWidth * comparedHeight))
  );
  const sampledWidth = Math.max(1, Math.floor(comparedWidth * sampleScale));
  const sampledHeight = Math.max(1, Math.floor(comparedHeight * sampleScale));
  const canvases = createSmokeComparisonCanvases(sampledWidth, sampledHeight, args.createDiff);
  let absoluteDelta = 0;
  let changed = 0;
  for (let top = 0; top < sampledHeight; top += 256) {
    const tile = {
      comparedWidth,
      drawing: canvases.drawing,
      height: Math.min(256, sampledHeight - top),
      normalizeDimensions: args.normalizeDimensions,
      sampleScale,
      sampledHeight,
      sampledWidth,
      tileHeight: 256,
      top,
    };
    const leftPixels = drawSmokeComparisonTile({ ...tile, image: leftImage });
    const rightPixels = drawSmokeComparisonTile({ ...tile, image: rightImage });
    const diffPixels = canvases.diffDrawing?.createImageData(sampledWidth, tile.height) ?? null;
    const row = compareSmokePixelRows(leftPixels, rightPixels, diffPixels);
    absoluteDelta += row.absoluteDelta;
    changed += row.changed;
    if (diffPixels) canvases.diffDrawing.putImageData(diffPixels, 0, top);
  }
  return createSmokeComparisonResult({
    absoluteDelta,
    changed,
    comparedHeight,
    comparedWidth,
    diffCanvas: canvases.diffCanvas,
    leftImage,
    normalizeDimensions: args.normalizeDimensions,
    rightImage,
    sampleScale,
    sampledHeight,
    sampledWidth,
  });
};
