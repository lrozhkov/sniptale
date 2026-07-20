import { describe, expect, it } from 'vitest';

import { escapeMarkdownFieldValue } from './fields';

describe('markdown field escaping', () => {
  it('escapes backslashes, pipes, and newlines for field values', () => {
    expect(escapeMarkdownFieldValue('path\\to|value\nnext')).toBe('path\\\\to\\|value<br>next');
  });
});
