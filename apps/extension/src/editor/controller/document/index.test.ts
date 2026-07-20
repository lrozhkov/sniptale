import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorDocument } from '../../../features/editor/document/types';

const mocks = vi.hoisted(() => ({
  emptyCanvasJsonMock: vi.fn(() => '{"empty":true}'),
  fitSourceMock: vi.fn(() => false),
  fromUrlMock: vi.fn(),
  getFabricImageIntrinsicSizeMock: vi.fn(() => ({ width: 320, height: 180 })),
  preserveCanvasMock: vi.fn(() => true),
  resolveEditorSceneLayoutMock: vi.fn(),
}));

vi.mock('fabric', () => ({
  FabricImage: {
    fromURL: mocks.fromUrlMock,
  },
}));

vi.mock('../../browser-frame/layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../browser-frame/layout')>()),
  resolveEditorSceneLayout: mocks.resolveEditorSceneLayoutMock,
  shouldFitSourceToContent: mocks.fitSourceMock,
  shouldPreserveCanvasForBrowserFrame: mocks.preserveCanvasMock,
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  emptyCanvasJson: mocks.emptyCanvasJsonMock,
}));

vi.mock('../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../document/model')>('../../document/model');

  return {
    ...actual,
    getFabricImageIntrinsicSize: mocks.getFabricImageIntrinsicSizeMock,
    isUserObject: (object: { keep?: boolean }) => Boolean(object.keep),
  };
});

import { createBaseDocument, prepareAppliedDocument, serializeCanvasObjects } from './';

function createDocument(): EditorDocument {
  return {
    browserFrame: {
      appearance: 'window',
      canvasMode: 'resize',
      contentMode: 'push-down',
      enabled: false,
      title: '',
      url: '',
    },
    canvasHeight: 900,
    canvasJson: '{}',
    canvasWidth: 1400,
    frame: {
      backgroundColor: '#fff',
      backgroundGradientAngle: 0,
      backgroundGradientFrom: '#fff',
      backgroundGradientTo: '#000',
      backgroundImageData: null,
      backgroundImageFit: 'cover',
      backgroundMode: 'color',
      browserMode: true,
      browserTitle: 'Frame title',
      browserUrl: 'https://frame.example',
      layoutMode: 'expand-canvas',
      paddingBottom: 20,
      paddingLeft: 30,
      paddingRight: 40,
      paddingTop: 10,
    },
    sourceDisplayHeight: 300,
    sourceDisplayWidth: 500,
    sourceHeight: 300,
    sourceImageData: 'data:image/png;base64,abc',
    sourceLeft: 70,
    sourceName: 'source.png',
    sourceTop: 90,
    sourceWidth: 500,
    version: 1 as const,
  };
}

function setupDocumentMocks() {
  vi.clearAllMocks();
  mocks.emptyCanvasJsonMock.mockReturnValue('{"empty":true}');
  mocks.getFabricImageIntrinsicSizeMock.mockReturnValue({ width: 320, height: 180 });
  mocks.preserveCanvasMock.mockReturnValue(true);
  mocks.fitSourceMock.mockReturnValue(false);
  mocks.resolveEditorSceneLayoutMock.mockReturnValue({
    canvas: { height: 240, width: 400 },
    source: { height: 180, left: 16, top: 12, width: 320 },
  });
}

function runSerializeCanvasEmptySuite() {
  it('serializes only user canvas objects and falls back to the empty payload', () => {
    expect(serializeCanvasObjects(null)).toBe('{"empty":true}');
  });
}

function createSerializedTextObject() {
  return {
    keep: true,
    toObject: vi.fn(() => ({
      id: 'keep',
      sniptaleTextBackgroundOpacity: 0.6,
      sniptaleTextCalloutFormat: 'bubble',
      sniptaleTextCalloutHeight: 92,
      sniptaleTextCalloutShadow: 30,
      sniptaleTextCalloutWidth: 340,
      sniptaleTextVerticalAlign: 'bottom',
      styles: { 0: { 1: { fontStyle: 'italic', underline: true } } },
    })),
  };
}

function expectSerializedCalloutMetadata(result: string) {
  expect(JSON.parse(result)).toEqual({
    objects: [
      {
        id: 'keep',
        sniptaleTextBackgroundOpacity: 0.6,
        sniptaleTextCalloutFormat: 'bubble',
        sniptaleTextCalloutHeight: 92,
        sniptaleTextCalloutShadow: 30,
        sniptaleTextCalloutWidth: 340,
        sniptaleTextVerticalAlign: 'bottom',
        styles: { 0: { 1: { fontStyle: 'italic', underline: true } } },
      },
    ],
    version: '7.2.0',
  });
}

function runSerializeCanvasCalloutMetadataSuite() {
  it('keeps editor text callout metadata in serialized user objects', () => {
    const keepObject = createSerializedTextObject();
    const skippedObject = {
      keep: false,
      toObject: vi.fn(() => ({ id: 'skip' })),
    };

    const result = serializeCanvasObjects({
      getObjects: () => [keepObject, skippedObject],
    } as never);

    expectSerializedCalloutMetadata(result);
    expect(keepObject.toObject).toHaveBeenCalledWith(
      expect.arrayContaining([
        'sniptaleId',
        'sniptaleBlurStrokeColor',
        'sniptaleBlurStrokeWidth',
        'sniptaleTextBackgroundOpacity',
        'sniptaleTextCalloutFormat',
        'sniptaleTextCalloutHeight',
        'sniptaleTextCalloutShadow',
        'sniptaleTextCalloutWidth',
        'sniptaleTextVerticalAlign',
      ])
    );
    expect(keepObject.toObject).toHaveBeenCalledWith(
      expect.not.arrayContaining(['sniptaleTextVariant'])
    );
    expect(skippedObject.toObject).not.toHaveBeenCalled();
  });
}

function runCreateBaseDocumentSuite() {
  it('creates the base editor document from the source image and resolved layout', async () => {
    const sourceDocument = createDocument();

    mocks.fromUrlMock.mockResolvedValue({ id: 'image' });

    const document = await createBaseDocument(
      'data:image/png;base64,base',
      'capture.png',
      sourceDocument.frame,
      sourceDocument.browserFrame!
    );

    expect(mocks.resolveEditorSceneLayoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        browserFrame: sourceDocument.browserFrame,
        fitSourceToContent: false,
        frame: sourceDocument.frame,
        hasBrowserFrame: false,
        preserveCanvasSize: true,
        source: { height: 180, width: 320 },
      })
    );
    expect(document).toEqual(
      expect.objectContaining({
        browserFrame: sourceDocument.browserFrame,
        canvasHeight: 240,
        canvasJson: '{"empty":true}',
        canvasWidth: 400,
        frame: sourceDocument.frame,
        sourceDisplayHeight: 180,
        sourceDisplayWidth: 320,
        sourceHeight: 180,
        sourceImageData: 'data:image/png;base64,base',
        sourceLeft: 16,
        sourceName: 'capture.png',
        sourceTop: 12,
        sourceWidth: 320,
      })
    );
  });
}

function runPrepareAppliedDocumentStateSuite() {
  it('normalizes the applied document frame, browser state, and source payload', () => {
    const prepared = prepareAppliedDocument({
      ...createDocument(),
      browserFrame: {
        ...createDocument().browserFrame!,
        contentMode: 'keep-position' as never,
      },
    });

    expect(prepared.frame).toEqual(
      expect.objectContaining({
        browserMode: true,
        browserTitle: 'Frame title',
        browserUrl: 'https://frame.example',
      })
    );
    expect(prepared.browserFrame).toEqual(
      expect.objectContaining({
        contentMode: 'fit-content',
        title: '',
        url: '',
      })
    );
    expect(prepared.canvasSize).toEqual({ height: 900, width: 1400 });
    expect(prepared.normalizedDocument.richShapes).toEqual([]);
    expect(prepared.source).toEqual(
      expect.objectContaining({
        dataUrl: 'data:image/png;base64,abc',
        displayHeight: 300,
        displayWidth: 500,
        intrinsicHeight: 300,
        intrinsicWidth: 500,
        locked: true,
        visible: true,
      })
    );
    expect(prepared.normalizedDocument.richShapes).toEqual([]);
  });
}

function runPrepareAppliedDocumentFallbackSuite() {
  it('falls back to canonical browser defaults when the incoming content mode is invalid', () => {
    const prepared = prepareAppliedDocument({
      ...createDocument(),
      browserFrame: {
        ...createDocument().browserFrame!,
        contentMode: 'unsupported-mode' as never,
        enabled: true,
        title: 'Custom title',
        url: 'https://custom.example',
      },
      frame: {
        ...createDocument().frame,
        browserMode: false,
      },
    });

    expect(prepared.browserFrame).toEqual(
      expect.objectContaining({
        contentMode: 'push-down',
        title: 'Custom title',
        url: 'https://custom.example',
      })
    );
  });
}

describe('editor-controller-document', () => {
  beforeEach(setupDocumentMocks);
  runSerializeCanvasEmptySuite();
  runSerializeCanvasCalloutMetadataSuite();
  runCreateBaseDocumentSuite();
  runPrepareAppliedDocumentStateSuite();
  runPrepareAppliedDocumentFallbackSuite();
});
