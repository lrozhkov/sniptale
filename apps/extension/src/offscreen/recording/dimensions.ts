type RecordingPixelSize = {
  width: number;
  height: number;
};

export function resolveRecordingSafeDimension(value: number): number {
  const dimension = Math.max(1, Math.round(value));

  return dimension > 1 && dimension % 2 !== 0 ? dimension - 1 : dimension;
}

export function resolveRecordingSafeSize(size: RecordingPixelSize): RecordingPixelSize {
  return {
    width: resolveRecordingSafeDimension(size.width),
    height: resolveRecordingSafeDimension(size.height),
  };
}

export function isRecordingSafeSize(size: RecordingPixelSize): boolean {
  const safeSize = resolveRecordingSafeSize(size);

  return safeSize.width === size.width && safeSize.height === size.height;
}
