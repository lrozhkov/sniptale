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

const WINDOWS_RESERVED_STEMS = new Set([
  'aux',
  'con',
  'nul',
  'prn',
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);
const INVALID_SEGMENT_CHARACTERS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);
const MAX_ARCHIVE_SEGMENT_LENGTH = 120;

function replaceInvalidSegmentCharacters(value: string): string {
  return Array.from(value, (character) =>
    hasControlCharacter(character) || INVALID_SEGMENT_CHARACTERS.has(character) ? '-' : character
  ).join('');
}

function truncateSegment(value: string, maxLength: number): string {
  return Array.from(value).slice(0, maxLength).join('');
}

function removeTerminalWindowsCharacters(value: string): string {
  let result = value;
  while (result.endsWith('.') || result.endsWith(' ')) result = result.slice(0, -1);
  return result;
}

export function sanitizeArchivePathSegment(value: string, fallback = 'Untitled'): string {
  const normalized = replaceInvalidSegmentCharacters(value.normalize('NFC')).trim();
  const truncated = removeTerminalWindowsCharacters(
    truncateSegment(normalized, MAX_ARCHIVE_SEGMENT_LENGTH)
  );
  const candidate =
    truncated === '' || truncated === '.' || truncated === '..' ? fallback : truncated;
  const stem = candidate.split('.', 1)[0]?.toLocaleLowerCase('en-US') ?? '';
  const safe = WINDOWS_RESERVED_STEMS.has(stem) ? `_${candidate}` : candidate;
  return (
    removeTerminalWindowsCharacters(truncateSegment(safe, MAX_ARCHIVE_SEGMENT_LENGTH)) || fallback
  );
}

function appendCollisionSuffix(filename: string, suffix: number): string {
  const extensionIndex = filename.lastIndexOf('.');
  const hasExtension = extensionIndex > 0 && extensionIndex < filename.length - 1;
  const extension = hasExtension ? filename.slice(extensionIndex) : '';
  const stem = hasExtension ? filename.slice(0, extensionIndex) : filename;
  const marker = ` (${suffix})`;
  const payloadLength = MAX_ARCHIVE_SEGMENT_LENGTH - Array.from(marker).length;
  const boundedExtension = truncateSegment(extension, Math.max(0, payloadLength - 1));
  const maxStemLength = Math.max(1, payloadLength - Array.from(boundedExtension).length);
  return `${truncateSegment(stem, maxStemLength)}${marker}${boundedExtension}`;
}

export interface ArchivePathAllocator {
  reserve(segments: readonly string[]): string;
}

interface ArchiveDirectoryState {
  directoryAliases: Map<string, string>;
  directories: Map<string, ArchiveDirectoryState>;
  files: Set<string>;
}

function createDirectoryState(): ArchiveDirectoryState {
  return { directories: new Map(), directoryAliases: new Map(), files: new Set() };
}

export function createArchivePathAllocator(): ArchivePathAllocator {
  const root = createDirectoryState();
  return {
    reserve(segments) {
      if (segments.length === 0)
        throw new Error('Media archive path requires at least one segment.');
      const parents: string[] = [];
      let directory = root;
      for (const requested of segments.slice(0, -1)) {
        const alias = requested.normalize('NFC');
        let allocated = directory.directoryAliases.get(alias);
        if (!allocated) {
          const base = sanitizeArchivePathSegment(requested);
          allocated = base;
          let collision = 1;
          while (
            directory.files.has(allocated.toLocaleLowerCase('en-US')) ||
            directory.directories.has(allocated.toLocaleLowerCase('en-US'))
          ) {
            collision += 1;
            allocated = appendCollisionSuffix(base, collision);
          }
          directory.directoryAliases.set(alias, allocated);
          directory.directories.set(allocated.toLocaleLowerCase('en-US'), createDirectoryState());
        }
        parents.push(allocated);
        directory = directory.directories.get(allocated.toLocaleLowerCase('en-US'))!;
      }
      const filename = sanitizeArchivePathSegment(segments.at(-1)!);
      let collision = 1;
      let candidate = [...parents, filename].join('/');
      let allocatedFilename = filename;
      while (
        directory.files.has(allocatedFilename.toLocaleLowerCase('en-US')) ||
        directory.directories.has(allocatedFilename.toLocaleLowerCase('en-US'))
      ) {
        collision += 1;
        allocatedFilename = appendCollisionSuffix(filename, collision);
        candidate = [...parents, allocatedFilename].join('/');
      }
      assertSafeArchivePath(candidate);
      directory.files.add(allocatedFilename.toLocaleLowerCase('en-US'));
      return candidate;
    },
  };
}
