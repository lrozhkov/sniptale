const MIN_CURSOR_TARGET_DISTANCE = 120;

export function isDistinctCursorTarget(
  sample: { x: number; y: number },
  index: number,
  samples: readonly { x: number; y: number }[]
): boolean {
  if (index === 0) {
    return true;
  }

  const previous = samples[index - 1];
  return (
    !previous ||
    Math.hypot(sample.x - previous.x, sample.y - previous.y) >= MIN_CURSOR_TARGET_DISTANCE
  );
}
