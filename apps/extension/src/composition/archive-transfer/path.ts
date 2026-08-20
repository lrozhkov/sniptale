function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export function assertSafeArchivePath(path: string): void {
  if (
    path.length === 0 ||
    path.length > 1024 ||
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.includes('\\')
  ) {
    throw new Error(`Invalid media archive path: ${path}.`);
  }

  const segments = path.split('/');
  if (
    segments.some(
      (segment) =>
        segment === '' || segment === '.' || segment === '..' || hasControlCharacter(segment)
    )
  ) {
    throw new Error(`Invalid media archive path: ${path}.`);
  }
}

export function createArchiveObjectPath(objectId: string, filename: string): string {
  const objectSegment = encodeURIComponent(objectId);
  const filenameSegment = encodeURIComponent(filename);
  const path = `objects/${objectSegment}/${filenameSegment}`;
  assertSafeArchivePath(path);
  return path;
}
