import { describe, expect, it } from 'vitest';
import { assertSafeArchivePath, createArchiveObjectPath } from './path';

describe('archive paths', () => {
  it('creates encoded object paths', () => {
    expect(createArchiveObjectPath('asset/id', 'clip name.webm')).toBe(
      'objects/asset%2Fid/clip%20name.webm'
    );
  });

  it.each([
    '',
    '/absolute',
    '../escape',
    'a/../b',
    'a\\b',
    'a//b',
    'a/./b',
    'a/',
    `a/${String.fromCharCode(0)}`,
    'a'.repeat(1025),
  ])('rejects unsafe path %s', (path) =>
    expect(() => assertSafeArchivePath(path)).toThrow('Invalid media archive path')
  );
});
