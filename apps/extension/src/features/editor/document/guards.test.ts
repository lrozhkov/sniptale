import { describe, expect, it } from 'vitest';

import { isEditorDocument } from './guards';
import { EDITOR_ARROW_VARIANT, EDITOR_BRUSH_SHAPE_CORRECTION } from './types';
import { createDefaultRichShapeObject } from './rich-shape';

const TEST_IMAGE_DATA_URL =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';

function createEditorDocumentFixture() {
  return {
    version: 1 as const,
    sourceImageData: TEST_IMAGE_DATA_URL,
    sourceName: 'capture.png',
    sourceWidth: 1280,
    sourceHeight: 720,
    canvasWidth: 1280,
    canvasHeight: 720,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 1280,
    sourceDisplayHeight: 720,
    frame: {
      browserMode: false,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      backgroundMode: 'color' as const,
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#000000',
      backgroundGradientAngle: 90,
      backgroundImageData: null,
      backgroundImageFit: 'cover' as const,
      layoutMode: 'fit-image' as const,
      browserTitle: '',
      browserUrl: '',
    },
    browserFrame: {
      title: 'Example',
      url: 'https://example.com',
      faviconDataUrl: 'data:image/png;base64,favicon',
      canvasMode: 'resize' as const,
      contentMode: 'fit-content' as const,
    },
    canvasJson: '{}',
  };
}

function registerAcceptedDocumentTests() {
  registerBasicAcceptedDocumentTests();
  registerRichShapeAcceptedDocumentTests();
}

function registerBasicAcceptedDocumentTests() {
  it('accepts a fully shaped editor document', () => {
    expect(isEditorDocument(createEditorDocumentFixture())).toBe(true);
    expect(
      isEditorDocument({
        ...createEditorDocumentFixture(),
        sourceName: null,
      })
    ).toBe(true);
    expect(
      isEditorDocument({
        ...createEditorDocumentFixture(),
        browserFrame: {
          ...createEditorDocumentFixture().browserFrame,
          enabled: true,
          appearance: 'header',
        },
      })
    ).toBe(true);
  });

  it('accepts every background image fit mode used by the editor UI', () => {
    const modes = ['cover', 'contain', 'stretch', 'tile', 'fit-width', 'fit-height'] as const;

    modes.forEach((backgroundImageFit) => {
      expect(
        isEditorDocument({
          ...createEditorDocumentFixture(),
          frame: {
            ...createEditorDocumentFixture().frame,
            backgroundImageFit,
          },
        })
      ).toBe(true);
    });
  });

  it('keeps the editor-document runtime constants on their canonical union values', () => {
    expect(EDITOR_ARROW_VARIANT).toEqual({
      STANDARD: 'standard',
      TAPERED: 'tapered',
    });
    expect(EDITOR_BRUSH_SHAPE_CORRECTION).toEqual({
      OFF: 'off',
      SUBTLE: 'subtle',
      STRONG: 'strong',
    });
  });
}

function registerRichShapeAcceptedDocumentTests() {
  it('accepts additive rich shape document objects while keeping legacy documents loadable', () => {
    expect(isEditorDocument(createEditorDocumentFixture())).toBe(true);
    expect(
      isEditorDocument({
        ...createEditorDocumentFixture(),
        frame: {
          ...createEditorDocumentFixture().frame,
          backgroundGradientColorStops: [
            { color: '#ffffff', offset: 0 },
            { color: '#000000', offset: 0.4, opacity: 0.5 },
            { color: '#f97316', offset: 1 },
          ],
          backgroundGradientStops: ['#ffffff', '#000000', '#f97316'],
        },
        richShapes: [createDefaultRichShapeObject({ id: 'shape-1' })],
      })
    ).toBe(true);
  });
}

function registerRejectedDocumentTests() {
  registerRejectedFrameDocumentTests();
  registerRejectedBrowserFrameDocumentTests();
  registerRejectedGradientDocumentTests();
  registerRejectedRichShapeDocumentTests();
}

function registerRejectedFrameDocumentTests() {
  it('rejects malformed nested frame payloads', () => {
    expect(
      isEditorDocument({
        ...createEditorDocumentFixture(),
        frame: {
          ...createEditorDocumentFixture().frame,
          paddingTop: '12px',
        },
      })
    ).toBe(false);
  });
}

function registerRejectedBrowserFrameDocumentTests() {
  it('rejects malformed nested browser-frame payloads', () => {
    expect(
      isEditorDocument({
        ...createEditorDocumentFixture(),
        browserFrame: {
          ...createEditorDocumentFixture().browserFrame,
          title: 12,
        },
      })
    ).toBe(false);
    expect(
      isEditorDocument({
        ...createEditorDocumentFixture(),
        browserFrame: {
          ...createEditorDocumentFixture().browserFrame,
          canvasMode: 'stretch',
        },
      })
    ).toBe(false);
  });
}

function registerRejectedGradientDocumentTests() {
  it('rejects malformed gradient payloads', () => {
    expect(
      isEditorDocument({
        ...createEditorDocumentFixture(),
        browserFrame: {
          ...createEditorDocumentFixture().browserFrame,
          faviconDataUrl: 12,
        },
      })
    ).toBe(false);
  });
}

function registerRejectedRichShapeDocumentTests() {
  it('rejects malformed rich-shape payloads', () => {
    expect(
      isEditorDocument({
        ...createEditorDocumentFixture(),
        frame: {
          ...createEditorDocumentFixture().frame,
          backgroundGradientStops: ['#ffffff', 12],
        },
      })
    ).toBe(false);

    expect(
      isEditorDocument({
        ...createEditorDocumentFixture(),
        frame: {
          ...createEditorDocumentFixture().frame,
          backgroundGradientColorStops: [{ color: '#ffffff', offset: 'bad' }],
        },
      })
    ).toBe(false);

    expect(
      isEditorDocument({
        ...createEditorDocumentFixture(),
        frame: {
          ...createEditorDocumentFixture().frame,
          backgroundGradientColorStops: [{ color: '#ffffff', offset: 0, opacity: 'bad' }],
        },
      })
    ).toBe(false);

    expect(
      isEditorDocument({
        ...createEditorDocumentFixture(),
        richShapes: [{ objectType: 'rich-shape', shapeKind: 12 }],
      })
    ).toBe(false);
  });
}

describe('editor-document guards', () => {
  registerAcceptedDocumentTests();
  registerRejectedDocumentTests();
});
