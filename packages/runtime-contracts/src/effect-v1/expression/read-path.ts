export function isSafeEffectV1ReadPath(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase();
  if (['duration', 'frameindex', 'height', 'progress', 'time', 'width'].includes(normalized)) {
    return true;
  }
  if (['input.from', 'input.source', 'input.to', 'item'].includes(normalized)) return true;
  if (normalized.startsWith('item.')) return isSafeReadPathSuffix(value.slice(5));
  for (const prefix of ['controls.', 'defs.', 'layers.', 'tracks.', 'vars.']) {
    if (normalized.startsWith(prefix)) return isSafeReadPathSuffix(value.slice(prefix.length));
  }
  return false;
}

function isSafeReadPathSuffix(value: string): boolean {
  return (
    value.length > 0 &&
    [...value].every((character) => {
      const normalized = character.toLowerCase();
      return (
        (normalized >= 'a' && normalized <= 'z') ||
        (character >= '0' && character <= '9') ||
        character === '.' ||
        character === '_' ||
        character === '-'
      );
    })
  );
}
