function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function createStableCustomShapeId(
  fileName: string,
  label: string,
  uniqueInput: string
): string {
  const slug = (label || fileName || 'custom-shape')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `custom-${slug || 'shape'}-${hashText(uniqueInput)}`;
}
