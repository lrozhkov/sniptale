/** Closest target inside a display-derived tolerance; leaving it resumes free resizing. */
export function snapGuideSize(value: number, targets: readonly number[], tolerance: number) {
  let match: number | null = null;
  let distance = tolerance;
  for (const target of targets) {
    const next = Math.abs(value - target);
    if (next <= distance) {
      match = target;
      distance = next;
    }
  }
  return { value: match ?? value, matched: match !== null };
}
