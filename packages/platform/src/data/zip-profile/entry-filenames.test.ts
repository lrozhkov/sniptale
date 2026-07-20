import { describe, expect, it } from 'vitest';
import {
  createArchiveEntryLeafFilenameAllocator,
  isSafeArchiveEntryLeafFilename,
  sanitizeArchiveEntryLeafFilename,
} from './entry-filenames';

describe('archive entry leaf filenames', () => {
  it('normalizes unsafe archive entry names to local leaf filenames', () => {
    expect(sanitizeArchiveEntryLeafFilename('../escape.png')).toBe('escape.png');
    expect(sanitizeArchiveEntryLeafFilename('/absolute/path.png')).toBe('path.png');
    expect(sanitizeArchiveEntryLeafFilename('nested\\path\\asset.png')).toBe('asset.png');
    expect(sanitizeArchiveEntryLeafFilename('bad\u0000 name?.png')).toBe('bad_name.png');
    expect(sanitizeArchiveEntryLeafFilename('CON')).toBe('CON_file');
    expect(sanitizeArchiveEntryLeafFilename('...')).toBe('asset.bin');
    expect(
      isSafeArchiveEntryLeafFilename(
        sanitizeArchiveEntryLeafFilename(`asset${'. '.repeat(20_000)}`)
      )
    ).toBe(true);
  });

  it('allocates deterministic names when unsafe inputs collide after normalization', () => {
    const allocate = createArchiveEntryLeafFilenameAllocator();

    expect(allocate('../asset.png')).toBe('asset.png');
    expect(allocate('nested/asset.png')).toBe('asset-2.png');
    expect(allocate('ASSET.png')).toBe('ASSET-3.png');
  });

  it('keeps sanitizer and allocator output inside the validator contract at length boundaries', () => {
    const allocate = createArchiveEntryLeafFilenameAllocator();
    const inputs = [
      `${'a'.repeat(119)}.b`,
      `${'x'.repeat(120)}.png`,
      `${'x'.repeat(120)}.png`,
      '...',
      'CON',
    ];

    for (const input of inputs) {
      expect(isSafeArchiveEntryLeafFilename(sanitizeArchiveEntryLeafFilename(input))).toBe(true);
      expect(isSafeArchiveEntryLeafFilename(allocate(input))).toBe(true);
    }
  });

  it('validates archive leaf names without applying display-name normalization', () => {
    expect(isSafeArchiveEntryLeafFilename('demo capture.png')).toBe(true);
    expect(isSafeArchiveEntryLeafFilename('../escape.png')).toBe(false);
    expect(isSafeArchiveEntryLeafFilename('nested/asset.png')).toBe(false);
    expect(isSafeArchiveEntryLeafFilename('CON')).toBe(false);
    expect(isSafeArchiveEntryLeafFilename('report.txt:evil')).toBe(false);
    expect(isSafeArchiveEntryLeafFilename('name.')).toBe(false);
    expect(isSafeArchiveEntryLeafFilename('name ')).toBe(false);
    expect(isSafeArchiveEntryLeafFilename('bad\u0000name.png')).toBe(false);
  });
});
