import { describe, expect, it } from 'vitest';

import { isEditorBootstrapPayload } from './bootstrap';

const IMAGE_DATA_URL = 'data:image/png;base64,QUJDRA==';

describe('editor bootstrap payload boundary', () => {
  it('accepts the minimal payload and nullable optional metadata', () => {
    expect(isEditorBootstrapPayload({ dataUrl: IMAGE_DATA_URL })).toBe(true);
    expect(
      isEditorBootstrapPayload({
        dataUrl: IMAGE_DATA_URL,
        document: null,
        sourceFaviconUrl: null,
        title: 'Capture',
        url: 'https://example.com',
        capturedAt: 1_700_000_000_000,
      })
    ).toBe(true);
  });

  it.each([null, [], 'payload', 1])('rejects a non-record payload: %j', (value) => {
    expect(isEditorBootstrapPayload(value)).toBe(false);
  });

  it.each([
    { dataUrl: 'https://example.com/capture.png' },
    { dataUrl: IMAGE_DATA_URL, document: {} },
    { dataUrl: IMAGE_DATA_URL, sourceFaviconUrl: 1 },
    { dataUrl: IMAGE_DATA_URL, title: null },
    { dataUrl: IMAGE_DATA_URL, url: false },
    { dataUrl: IMAGE_DATA_URL, capturedAt: -1 },
    { dataUrl: IMAGE_DATA_URL, capturedAt: Number.NaN },
  ])('rejects malformed boundary fields: %j', (value) => {
    expect(isEditorBootstrapPayload(value)).toBe(false);
  });
});
