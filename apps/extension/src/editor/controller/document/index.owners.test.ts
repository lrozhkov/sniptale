import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import type { EditorDocument } from '../../../features/editor/document/types';

const mocks = vi.hoisted(() => ({
  emptyCanvasJsonMock: vi.fn(() => '{"empty":true}'),
  fromUrlMock: vi.fn(),
  getFabricImageIntrinsicSizeMock: vi.fn(() => ({ width: 320, height: 180 })),
  resolveEditorSceneLayoutMock: vi.fn(() => ({
    canvas: { height: 180, width: 320 },
    source: { height: 180, left: 0, top: 0, width: 320 },
  })),
}));

vi.mock('fabric', () => ({
  FabricImage: {
    fromURL: mocks.fromUrlMock,
  },
}));
vi.mock('../../browser-frame/layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../browser-frame/layout')>()),
  resolveEditorSceneLayout: mocks.resolveEditorSceneLayoutMock,
}));
vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  emptyCanvasJson: mocks.emptyCanvasJsonMock,
}));
vi.mock('../../document/model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../document/model')>()),
  getFabricImageIntrinsicSize: mocks.getFabricImageIntrinsicSizeMock,
  isUserObject: (object: { keep?: boolean }) => Boolean(object.keep),
}));

import { createBaseDocument } from './base-document';
import { prepareAppliedDocument } from './prepare-applied';
import { collectRichShapeDocumentObjects } from './rich-shape-serialization';
import { serializeCanvasObjects } from './serialization';

function createDocument(): EditorDocument {
  return {
    canvasHeight: 180,
    canvasJson: '{}',
    canvasWidth: 320,
    frame: DEFAULT_EDITOR_FRAME_SETTINGS,
    sourceDisplayHeight: 180,
    sourceDisplayWidth: 320,
    sourceHeight: 180,
    sourceImageData: 'data:image/png;base64,abc',
    sourceLeft: 0,
    sourceName: 'source.png',
    sourceTop: 0,
    sourceWidth: 320,
    version: 1,
  };
}

it('serializes Fabric user objects while excluding rich-shape document objects', () => {
  const normal = { keep: true, toObject: vi.fn(() => ({ id: 'normal' })) };
  const rich = {
    keep: true,
    sniptaleRichShape: { id: 'rich-shape' },
    sniptaleType: 'rich-shape',
    toObject: vi.fn(() => ({ id: 'rich' })),
  };
  const canvas = { getObjects: () => [normal, rich] };

  expect(JSON.parse(serializeCanvasObjects(canvas as never))).toEqual({
    objects: [{ id: 'normal' }],
    version: '7.2.0',
  });
  expect(collectRichShapeDocumentObjects(null)).toEqual([]);
});

it('creates base documents and prepares applied source state through role owners', async () => {
  mocks.fromUrlMock.mockResolvedValue({ id: 'image' });
  const document = createDocument();

  const base = await createBaseDocument(
    document.sourceImageData,
    document.sourceName,
    prepareAppliedDocument(document).frame,
    prepareAppliedDocument(document).browserFrame
  );
  const prepared = prepareAppliedDocument(base);

  expect(base.canvasJson).toBe('{"empty":true}');
  expect(prepared.canvasSize).toEqual({ height: 180, width: 320 });
  expect(prepared.source).toEqual(expect.objectContaining({ id: 'source-image-layer' }));
});
