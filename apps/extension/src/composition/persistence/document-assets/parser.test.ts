import { expect, it } from 'vitest';

import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../../features/editor/document/image-types';
import { createPersistedEditorDocumentFixture } from './test-support';
import { parsePersistedEditorDocument } from './parser';

function createPersistedDocument() {
  const document = createPersistedEditorDocumentFixture(createEditorDocumentFixture());
  return {
    ...document,
    frame: {
      ...document.frame,
      backgroundGradientColorStops: [{ color: '#fff', offset: 0, opacity: 1 }],
      backgroundGradientStops: ['#fff', '#000'],
      sourceImage: DEFAULT_EDITOR_IMAGE_SETTINGS,
    },
    browserFrame: {
      appearance: 'window' as const,
      canvasMode: 'resize' as const,
      contentMode: 'push-down' as const,
      enabled: true,
      favicon: null,
      title: 'Page',
      url: 'https://example.test',
    },
  };
}

it('constructs a fresh exact projection and strips unknown nested keys', () => {
  const expected = createPersistedDocument();
  const candidate = {
    ...expected,
    ignoredTopLevel: 'strip-me',
    sourceImage: { ...expected.sourceImage, ignoredPointerField: true },
    assets: expected.assets.map((asset) => ({ ...asset, ignoredAssetField: true })),
    frame: {
      ...expected.frame,
      ignoredFrameField: true,
      backgroundGradientColorStops: expected.frame.backgroundGradientColorStops?.map((stop) => ({
        ...stop,
        ignoredStopField: true,
      })),
      sourceImage: { ...expected.frame.sourceImage, ignoredImageField: true },
    },
    browserFrame: {
      ...expected.browserFrame,
      ignoredBrowserField: true,
      favicon: null,
    },
  };

  const parsed = parsePersistedEditorDocument(candidate);

  expect(parsed).toEqual(expected);
  expect(parsed).not.toBe(candidate);
  expect(parsed?.frame).not.toBe(candidate.frame);
  expect(parsed?.browserFrame).not.toBe(candidate.browserFrame);
  expect(parsed?.assets[0]).not.toBe(candidate.assets[0]);
});

const invalidNestedOverrides: ReadonlyArray<
  [string, { browserFrame?: Record<string, unknown>; frame?: Record<string, unknown> }]
> = [
  ['coerced background fit', { frame: { backgroundImageFit: { toString: () => 'cover' } } }],
  ['malformed source image settings', { frame: { sourceImage: { opacity: 1 } } }],
  ['malformed browser enabled flag', { browserFrame: { enabled: 'yes' } }],
  ['malformed browser appearance', { browserFrame: { appearance: 'dialog' } }],
];

it.each(invalidNestedOverrides)('rejects %s', (_label, override) => {
  const document = createPersistedDocument();
  const candidate = {
    ...document,
    ...(override.frame ? { frame: { ...document.frame, ...override.frame } } : {}),
    ...(override.browserFrame
      ? { browserFrame: { ...document.browserFrame, ...override.browserFrame } }
      : {}),
  };

  expect(parsePersistedEditorDocument(candidate)).toBeNull();
});

it('rejects malformed canvas JSON and undeclared nested canvas assets', () => {
  const document = createPersistedDocument();
  expect(parsePersistedEditorDocument({ ...document, canvasJson: '{' })).toBeNull();
  expect(
    parsePersistedEditorDocument({
      ...document,
      canvasJson: JSON.stringify({ objects: [{ src: 'sniptale-asset:undeclared' }] }),
    })
  ).toBeNull();
});

it('defaults omitted legacy blur metadata and rejects values outside the editor range', () => {
  const document = createPersistedDocument();
  const { backgroundBlurAmount: _backgroundBlurAmount, ...legacyFrame } = document.frame;

  expect(
    parsePersistedEditorDocument({ ...document, frame: legacyFrame })?.frame.backgroundBlurAmount
  ).toBe(0);
  expect(
    parsePersistedEditorDocument({
      ...document,
      frame: { ...document.frame, backgroundBlurAmount: -1 },
    })
  ).toBeNull();
  expect(
    parsePersistedEditorDocument({
      ...document,
      frame: { ...document.frame, backgroundBlurAmount: 26 },
    })
  ).toBeNull();
});
