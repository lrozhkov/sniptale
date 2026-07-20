export function compositeRasterBrushPixel(
  data: Uint8ClampedArray,
  offset: number,
  source: { alpha: number; blue: number; green: number; red: number }
): boolean {
  if (source.alpha <= 0) {
    return false;
  }

  const destinationRed = data[offset] ?? 0;
  const destinationGreen = data[offset + 1] ?? 0;
  const destinationBlue = data[offset + 2] ?? 0;
  const destinationAlphaByte = data[offset + 3] ?? 0;
  const destinationAlpha = destinationAlphaByte / 255;
  const outAlpha = source.alpha + destinationAlpha * (1 - source.alpha);
  if (outAlpha <= 0) {
    return assignRasterBrushPixel(data, offset, [0, 0, 0, 0]);
  }

  return assignRasterBrushPixel(data, offset, [
    Math.round(
      (source.red * source.alpha + destinationRed * destinationAlpha * (1 - source.alpha)) /
        outAlpha
    ),
    Math.round(
      (source.green * source.alpha + destinationGreen * destinationAlpha * (1 - source.alpha)) /
        outAlpha
    ),
    Math.round(
      (source.blue * source.alpha + destinationBlue * destinationAlpha * (1 - source.alpha)) /
        outAlpha
    ),
    Math.round(outAlpha * 255),
  ]);
}

function assignRasterBrushPixel(
  data: Uint8ClampedArray,
  offset: number,
  next: readonly [number, number, number, number]
): boolean {
  if (
    data[offset] === next[0] &&
    data[offset + 1] === next[1] &&
    data[offset + 2] === next[2] &&
    data[offset + 3] === next[3]
  ) {
    return false;
  }

  data[offset] = next[0];
  data[offset + 1] = next[1];
  data[offset + 2] = next[2];
  data[offset + 3] = next[3];
  return true;
}
