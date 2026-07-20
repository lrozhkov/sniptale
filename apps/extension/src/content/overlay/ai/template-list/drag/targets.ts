export function findTemplateIdUnderPoint(
  pillRefs: Map<string, HTMLDivElement>,
  x: number,
  y: number
): string | null {
  for (const [id, element] of pillRefs.entries()) {
    if (!element) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return id;
    }
  }

  return null;
}
