import { describe, expect, it } from 'vitest';
import {
  assertSafeArchivePath,
  createArchivePathAllocator,
  sanitizeArchivePathSegment,
} from './path';

describe('archive paths', () => {
  it('preserves readable Unicode while removing unsafe filesystem characters', () => {
    expect(sanitizeArchivePathSegment(' Снимок: экран?.png ')).toBe('Снимок- экран-.png');
    expect(sanitizeArchivePathSegment('CON')).toBe('_CON');
    expect(sanitizeArchivePathSegment('../')).toBe('..-');
  });

  it('allocates case-insensitively unique paths with extension-aware suffixes', () => {
    const allocator = createArchivePathAllocator();
    expect(allocator.reserve(['Screenshots', 'Capture.png'])).toBe('Screenshots/Capture.png');
    expect(allocator.reserve(['Screenshots', 'capture.PNG'])).toBe('Screenshots/capture (2).PNG');
    expect(allocator.reserve(['Screenshots', 'capture.png'])).toBe('Screenshots/capture (3).png');
  });

  it('removes Windows-invalid terminal characters introduced by truncation', () => {
    const allocator = createArchivePathAllocator();
    const longWithDotAtBoundary = `${'a'.repeat(119)}.x`;
    expect(sanitizeArchivePathSegment(longWithDotAtBoundary)).toBe('a'.repeat(119));
    expect(allocator.reserve(['Screenshots', longWithDotAtBoundary])).toBe(
      `Screenshots/${'a'.repeat(119)}`
    );
    expect(allocator.reserve(['Screenshots', 'a'.repeat(119)])).toBe(
      `Screenshots/${'a'.repeat(116)} (2)`
    );
  });

  it('allocates stable case-insensitive directory scopes', () => {
    const allocator = createArchivePathAllocator();
    expect(allocator.reserve(['Projects', 'Demo', 'Assets', 'first.png'])).toBe(
      'Projects/Demo/Assets/first.png'
    );
    expect(allocator.reserve(['Projects', 'demo', 'Assets', 'second.png'])).toBe(
      'Projects/demo (2)/Assets/second.png'
    );
    expect(allocator.reserve(['Projects', 'Demo', 'Assets', 'third.png'])).toBe(
      'Projects/Demo/Assets/third.png'
    );
  });

  it('prevents file and directory prefix collisions in either allocation order', () => {
    const allocator = createArchivePathAllocator();
    expect(allocator.reserve(['Recordings', 'Projects'])).toBe('Recordings/Projects');
    expect(allocator.reserve(['Recordings', 'Projects', 'Demo.webm'])).toBe(
      'Recordings/Projects (2)/Demo.webm'
    );
    expect(allocator.reserve(['Screenshots', 'Nested', 'image.png'])).toBe(
      'Screenshots/Nested/image.png'
    );
    expect(allocator.reserve(['Screenshots', 'Nested'])).toBe('Screenshots/Nested (2)');
  });

  it('keeps collision suffixes inside the segment length budget', () => {
    const allocator = createArchivePathAllocator();
    const longExtension = `a.${'b'.repeat(118)}`;
    expect(
      Array.from(allocator.reserve(['Screenshots', longExtension]).split('/')[1]!).length
    ).toBe(120);
    const collided = allocator.reserve(['Screenshots', longExtension]).split('/')[1]!;
    expect(Array.from(collided).length).toBe(120);
    expect(collided).toContain(' (2).');
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
