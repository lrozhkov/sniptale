import { describe, expect, it } from 'vitest';

import { sanitizeFilename } from './filename';

describe('persistence filename helper', () => {
  it('sanitizes unsafe characters and collapses whitespace', () => {
    expect(sanitizeFilename(' Demo / Project  ')).toBe('Demo_Project');
  });

  it('falls back to a stable default when the filename is empty after sanitization', () => {
    expect(sanitizeFilename('   ')).toBe('project-export');
  });
});
