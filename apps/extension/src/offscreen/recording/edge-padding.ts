const MAX_RIGHT_EDGE_PADDING_PX = 4;
const DARK_LUMA_THRESHOLD = 12;
const MIN_DARK_COLUMN_RATIO = 0.995;
const MIN_VISIBLE_NEIGHBOR_LUMA = 32;
const MIN_NEIGHBOR_DELTA = 24;

type EdgeSample = {
  data: Uint8ClampedArray;
  height: number;
  width: number;
};

type ColumnStats = {
  darkRatio: number;
  meanLuma: number;
};

function getLuma(data: Uint8ClampedArray, offset: number): number {
  return ((data[offset] ?? 0) + (data[offset + 1] ?? 0) + (data[offset + 2] ?? 0)) / 3;
}

function analyzeColumn(sample: EdgeSample, x: number): ColumnStats {
  let darkPixels = 0;
  let lumaTotal = 0;

  for (let y = 0; y < sample.height; y += 1) {
    const offset = (y * sample.width + x) * 4;
    const luma = getLuma(sample.data, offset);
    lumaTotal += luma;

    if (luma <= DARK_LUMA_THRESHOLD) {
      darkPixels += 1;
    }
  }

  return {
    darkRatio: darkPixels / sample.height,
    meanLuma: lumaTotal / sample.height,
  };
}

function isBlackPaddingColumn(stats: ColumnStats): boolean {
  return stats.darkRatio >= MIN_DARK_COLUMN_RATIO && stats.meanLuma <= DARK_LUMA_THRESHOLD;
}

function hasVisibleContentNeighbor(neighbor: ColumnStats, paddingColumn: ColumnStats): boolean {
  return (
    neighbor.meanLuma >= MIN_VISIBLE_NEIGHBOR_LUMA &&
    neighbor.meanLuma - paddingColumn.meanLuma >= MIN_NEIGHBOR_DELTA
  );
}

export function resolveRightEdgePaddingFromSample(sample: EdgeSample): number {
  if (sample.width < 2 || sample.height < 1) {
    return 0;
  }

  const maxPadding = Math.min(MAX_RIGHT_EDGE_PADDING_PX, sample.width - 1);
  let padding = 0;
  let leftmostPaddingColumn: ColumnStats | null = null;

  for (let offset = 1; offset <= maxPadding; offset += 1) {
    const stats = analyzeColumn(sample, sample.width - offset);
    if (!isBlackPaddingColumn(stats)) {
      break;
    }

    padding = offset;
    leftmostPaddingColumn = stats;
  }

  if (!padding || leftmostPaddingColumn === null) {
    return 0;
  }

  const neighbor = analyzeColumn(sample, sample.width - padding - 1);
  return hasVisibleContentNeighbor(neighbor, leftmostPaddingColumn) ? padding : 0;
}

export function detectRightEdgePadding(video: HTMLVideoElement): number {
  const sourceWidth = Math.round(video.videoWidth);
  const sourceHeight = Math.round(video.videoHeight);
  if (sourceWidth < 2 || sourceHeight < 1) {
    return 0;
  }

  const sampleWidth = Math.min(MAX_RIGHT_EDGE_PADDING_PX + 1, sourceWidth);
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = sourceHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return 0;
  }

  try {
    ctx.drawImage(
      video,
      sourceWidth - sampleWidth,
      0,
      sampleWidth,
      sourceHeight,
      0,
      0,
      sampleWidth,
      sourceHeight
    );
    const imageData = ctx.getImageData(0, 0, sampleWidth, sourceHeight);
    return resolveRightEdgePaddingFromSample({
      data: imageData.data,
      height: imageData.height,
      width: imageData.width,
    });
  } catch {
    return 0;
  }
}
