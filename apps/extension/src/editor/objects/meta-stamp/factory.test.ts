// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createMetaStamp } from './factory';

describe('metadata stamp factory', () => {
  it('creates a standard editable Fabric textbox with editor layer metadata', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'stamp-1' });
    const stamp = createMetaStamp('url', 'Page\nhttps://example.com', 12, 24, 3);

    expect(stamp).toMatchObject({
      left: 12,
      sniptaleId: 'stamp-1',
      sniptaleMetaKind: 'url',
      sniptaleRole: 'stamp',
      sniptaleType: 'meta-stamp',
      top: 24,
    });
    expect(stamp.text).toBe('Page\nhttps://example.com');
  });
});
