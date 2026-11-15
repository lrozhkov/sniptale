import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../document/constants';
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

it('admits retained logical 3 bootstrap documents and rejects legacy mislabeling', () => {
  const document = {
    version: 3,
    sourceImageData: IMAGE_DATA_URL,
    sourceName: null,
    sourceWidth: 12,
    sourceHeight: 8,
    canvasWidth: 8,
    canvasHeight: 6,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 8,
    sourceDisplayHeight: 6,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    canvasJson: JSON.stringify({
      objects: [
        {
          sniptaleRasterState: {
            version: 1,
            width: 12,
            height: 8,
            crop: { x: 2, y: 1, width: 8, height: 6 },
          },
          sniptaleRasterOriginalData: IMAGE_DATA_URL,
        },
      ],
    }),
  };
  expect(isEditorBootstrapPayload({ dataUrl: IMAGE_DATA_URL, document })).toBe(true);
  expect(
    isEditorBootstrapPayload({ dataUrl: IMAGE_DATA_URL, document: { ...document, version: 2 } })
  ).toBe(false);
});
