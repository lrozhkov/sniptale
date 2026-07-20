import {
  hasAsciiControlCharacter,
  stripAsciiControlCharacters,
} from '../../security/sanitizers/text';

const PATH_SEGMENT_SEPARATOR_PATTERN = /[/\\]+/;
const UNSAFE_ARCHIVE_LEAF_CHARACTER_PATTERN = /[:*?"<>|]/u;
const RESERVED_ARCHIVE_FILENAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

function decodeArchiveFilenameSeparators(filename: string): string {
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
}

function splitArchiveExtension(filename: string): { basename: string; extension: string } {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === filename.length - 1) {
    return { basename: filename, extension: '' };
  }

  return {
    basename: filename.slice(0, dotIndex),
    extension: filename.slice(dotIndex),
  };
}

function trimArchiveTrailingDotsAndSpaces(value: string): string {
  let end = value.length;
  while (end > 0) {
    const character = value[end - 1];
    if (character !== '.' && character !== ' ') {
      break;
    }
    end -= 1;
  }
  return value.slice(0, end);
}

function normalizeArchiveLeafCandidate(value: string): string {
  return trimArchiveTrailingDotsAndSpaces(
    value
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/ /g, '_')
      .slice(0, 120)
  );
}

function avoidReservedArchiveFilename(filename: string): string {
  const { basename, extension } = splitArchiveExtension(filename);
  return RESERVED_ARCHIVE_FILENAMES.has(basename.toLowerCase())
    ? `${basename}_file${extension}`
    : filename;
}

export function sanitizeArchiveEntryLeafFilename(filename: string, fallback = 'asset.bin'): string {
  const normalized = stripAsciiControlCharacters(
    decodeArchiveFilenameSeparators(filename),
    ' '
  ).trim();
  const leafName = normalized.split(PATH_SEGMENT_SEPARATOR_PATTERN).filter(Boolean).pop() ?? '';
  const sanitized = normalizeArchiveLeafCandidate(leafName);
  const withoutDots = sanitized.replace(/\./g, '');
  if (sanitized.length === 0 || withoutDots.length === 0) {
    const safeFallback = normalizeArchiveLeafCandidate(fallback);
    return safeFallback && safeFallback.replace(/\./g, '')
      ? avoidReservedArchiveFilename(safeFallback)
      : 'asset.bin';
  }

  return avoidReservedArchiveFilename(sanitized);
}

export function isSafeArchiveEntryLeafFilename(filename: string): boolean {
  const trimmed = filename.trim();
  if (
    trimmed.length === 0 ||
    trimmed !== filename ||
    hasAsciiControlCharacter(filename) ||
    UNSAFE_ARCHIVE_LEAF_CHARACTER_PATTERN.test(filename) ||
    filename.includes('/') ||
    filename.includes('\\') ||
    filename === '.' ||
    filename === '..' ||
    filename.replace(/\./g, '').length === 0 ||
    /[. ]$/u.test(filename)
  ) {
    return false;
  }

  const { basename } = splitArchiveExtension(filename);
  return !RESERVED_ARCHIVE_FILENAMES.has(basename.toLowerCase());
}

export function createArchiveEntryLeafFilenameAllocator(): (filename: string) => string {
  const usedNames = new Set<string>();

  return (filename: string) => {
    const sanitized = sanitizeArchiveEntryLeafFilename(filename);
    const { basename, extension } = splitArchiveExtension(sanitized);
    let candidate = sanitized;
    let index = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      const suffix = `-${index}`;
      const availableBasenameLength = Math.max(1, 120 - extension.length - suffix.length);
      candidate = `${basename.slice(0, availableBasenameLength)}${suffix}${extension}`;
      index += 1;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  };
}
