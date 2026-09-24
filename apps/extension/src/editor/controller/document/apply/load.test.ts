import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRichShapeObject: vi.fn(() => ({ sniptaleId: 'rich-object' })),
  ensureEditorSourceLayer: vi.fn(async () => ({ id: 'source' })),
  prepareCanvasForDocumentLoad: vi.fn(),
  renderCanvasAfterDocumentLoad: vi.fn(),
  restoreCanonicalEditorDrawingObjects: vi.fn(),
}));

vi.mock('../../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../objects/rich-shape')>()),
  createRichShapeObject: mocks.createRichShapeObject,
}));

vi.mock('../source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../source')>()),
  ensureEditorSourceLayer: mocks.ensureEditorSourceLayer,
}));

vi.mock('../../core/debug', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/debug')>()),
  logEditorSourceTrace: vi.fn(),
}));

vi.mock('./canvas', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./canvas')>()),
  prepareCanvasForDocumentLoad: mocks.prepareCanvasForDocumentLoad,
  renderCanvasAfterDocumentLoad: mocks.renderCanvasAfterDocumentLoad,
}));
vi.mock('../../../drawing/object/canonicalize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../drawing/object/canonicalize')>()),
  restoreCanonicalEditorDrawingObjects: mocks.restoreCanonicalEditorDrawingObjects,
}));

import { loadPreparedDocumentOnCanvas, restoreRichShapeObjects } from './load';
import {
  createFabricCanvasFixture,
  createTypedTestFixture,
} from '../../../testing/fabric-canvas.test-support';
import type { LoadPreparedDocumentOptions } from './types';
import { createFrameAnnotationProxy } from '../../../frame-annotation/proxy';
import { CUSTOM_JSON_PROPS } from '../../../document/model/custom-json-props';
import { SnapshotHistory } from '@sniptale/foundation/history/snapshot-history';
import { undoEditorControllerSnapshot } from '../../public-api/document/history';
import { createMockDocument } from '../../instance/bindings/test-fixtures-document';
import { prepareAppliedDocument } from '..';
import type { EditorDocument } from '../../../../features/editor/document/types';

function createPreparedDocument() {
  return {
    canvasSize: { height: 20, width: 30 },
    browserFrame: { enabled: true, title: 'Restored title' },
    normalizedDocument: {
      canvasJson: '{"objects":[]}',
      frame: { backgroundMode: 'color' },
      richShapes: [{ id: 'rich-1' }],
    },
    source: { displayHeight: 20, displayWidth: 30 },
  };
}

describe('document apply load owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRichShapeObject.mockReturnValue({ sniptaleId: 'rich-object' });
  });

  it('loads prepared JSON, restores rich shapes, source, background, and render', async () => {
    const canvas = {
      add: vi.fn(),
      getObjects: vi.fn(() => [{ sniptaleId: 'json-object' }]),
      loadFromJSON: vi.fn(async () => undefined),
    };
    const prepareObject = vi.fn();
    const syncBackgroundLayer = vi.fn(async () => undefined);

    const rebuildFrameDecorations = vi.fn(async () => undefined);
    await expect(
      loadPreparedDocumentOnCanvas({
        canvas: canvas as never,
        prepared: createPreparedDocument() as never,
        prepareObject,
        rebuildFrameDecorations,
        syncBackgroundLayer,
        viewportDevicePixelRatioBaseline: 2,
        zoomLevel: 1,
      })
    ).resolves.toEqual({ id: 'source' });

    expect(canvas.loadFromJSON).toHaveBeenCalledWith('{"objects":[]}');
    expect(prepareObject).toHaveBeenCalledWith({ sniptaleId: 'json-object' });
    expect(canvas.add).toHaveBeenCalledWith({ sniptaleId: 'rich-object' });
    expect(mocks.restoreCanonicalEditorDrawingObjects).toHaveBeenCalledWith({
      canvas,
      prepareObject,
      source: { id: 'source' },
    });
    expect(syncBackgroundLayer).toHaveBeenCalledWith(
      { backgroundMode: 'color' },
      { height: 20, width: 30 }
    );
    expect(rebuildFrameDecorations).toHaveBeenCalledWith({
      enabled: true,
      title: 'Restored title',
    });
    expect(mocks.renderCanvasAfterDocumentLoad).toHaveBeenCalledWith(canvas);
  });

  it('recovers both the canvas and cursor when a history load fails after replacing objects', async () => {
    const original = {
      ...createMockDocument(),
      canvasJson: JSON.stringify({ objects: [{ type: 'Rect', sniptaleId: 'original' }] }),
    };
    const edited = {
      ...createMockDocument(),
      canvasJson: JSON.stringify({ objects: [{ type: 'Rect', sniptaleId: 'edited' }] }),
    };
    const history = new SnapshotHistory(JSON.stringify(original));
    history.push(JSON.stringify(edited));
    let loadedObjects: Array<{ sniptaleId: string }> = [{ sniptaleId: 'edited' }];
    const canvas = {
      add: vi.fn(),
      getObjects: () => loadedObjects,
      loadFromJSON: vi.fn(async (json: string) => {
        loadedObjects = (JSON.parse(json) as { objects: Array<{ sniptaleId: string }> }).objects;
      }),
    };
    let failAfterReplacement = true;
    const applyDocument = async (document: EditorDocument) => {
      await loadPreparedDocumentOnCanvas({
        canvas: createFabricCanvasFixture(canvas),
        prepared: prepareAppliedDocument(document),
        prepareObject: vi.fn(),
        rebuildFrameDecorations: vi.fn(async () => undefined),
        syncBackgroundLayer: async () => {
          if (failAfterReplacement) {
            failAfterReplacement = false;
            throw new Error('background rebuild failed');
          }
        },
        zoomLevel: 1,
      });
    };

    await expect(
      undoEditorControllerSnapshot({ applyDocument, history, publishHistoryDocument: vi.fn() })
    ).rejects.toThrow('background rebuild failed');
    expect(canvas.loadFromJSON).toHaveBeenCalledTimes(2);
    expect(loadedObjects).toEqual([{ type: 'Rect', sniptaleId: 'edited' }]);
    expect(history.getState().index).toBe(1);
  });

  it('skips rich shapes that cannot be reconstructed', () => {
    const canvas = { add: vi.fn() };
    mocks.createRichShapeObject.mockReturnValue(null as never);

    restoreRichShapeObjects(canvas as never, [{ id: 'rich-1' }] as never, {
      prepareObject: vi.fn(),
    });

    expect(canvas.add).not.toHaveBeenCalled();
  });

  it('loads without optional viewport and background callbacks', async () => {
    const canvas = {
      add: vi.fn(),
      getObjects: vi.fn(() => []),
      loadFromJSON: vi.fn(async () => undefined),
    };
    const prepared = createPreparedDocument();
    prepared.normalizedDocument.richShapes = [];
    await expect(
      loadPreparedDocumentOnCanvas({
        canvas: createFabricCanvasFixture(canvas),
        prepared: createTypedTestFixture<LoadPreparedDocumentOptions['prepared']>(prepared),
        prepareObject: vi.fn(),
        rebuildFrameDecorations: vi.fn(async () => undefined),
        zoomLevel: 1,
      })
    ).resolves.toEqual({ id: 'source' });
  });

  it('fails the load when Fabric does not restore a validated frame proxy as a Rect', async () => {
    const proxy = createFrameAnnotationProxy({
      frame: { id: 'frame-1', x: 1, y: 2, width: 100, height: 80, effectMode: 'border' },
      label: 'Frame 1',
      ordering: 0,
    });
    const frameObject = {
      sniptaleId: 'frame-1',
      sniptaleRole: 'annotation',
      sniptaleType: 'frame-annotation',
      sniptaleFrameAnnotationRevision: 1,
      sniptaleFrameAnnotationJson: proxy.sniptaleFrameAnnotationJson,
    };
    const canvas = {
      add: vi.fn(),
      getObjects: vi.fn(() => [frameObject]),
      loadFromJSON: vi.fn(async () => undefined),
    };
    const prepared = createPreparedDocument();
    prepared.normalizedDocument.richShapes = [];
    prepared.normalizedDocument.canvasJson = JSON.stringify({
      objects: [proxy.toObject([...CUSTOM_JSON_PROPS])],
    });
    await expect(
      loadPreparedDocumentOnCanvas({
        canvas: createFabricCanvasFixture(canvas),
        prepared: createTypedTestFixture<LoadPreparedDocumentOptions['prepared']>(prepared),
        prepareObject: vi.fn(),
        rebuildFrameDecorations: vi.fn(async () => undefined),
        zoomLevel: 1,
      })
    ).rejects.toThrow('Invalid frame annotation proxy');
  });

  it('loads a saved frame proxy from validated metadata when serialized Fabric geometry drifted', async () => {
    const proxy = createFrameAnnotationProxy({
      frame: { id: 'frame-1', x: 1, y: 2, width: 100, height: 80 },
      label: 'Frame 1',
      ordering: 0,
    });
    const canvas = {
      add: vi.fn(),
      getObjects: vi.fn(() => []),
      loadFromJSON: vi.fn(async (_json: string) => undefined),
    };
    const prepared = createPreparedDocument();
    prepared.normalizedDocument.richShapes = [];
    prepared.normalizedDocument.canvasJson = JSON.stringify({
      objects: [{ ...proxy.toObject([...CUSTOM_JSON_PROPS]), left: 48 }],
    });

    await loadPreparedDocumentOnCanvas({
      canvas: createFabricCanvasFixture(canvas),
      prepared: createTypedTestFixture<LoadPreparedDocumentOptions['prepared']>(prepared),
      prepareObject: vi.fn(),
      rebuildFrameDecorations: vi.fn(async () => undefined),
      zoomLevel: 1,
    });

    const loaded = JSON.parse(String(canvas.loadFromJSON.mock.calls[0]?.[0])) as {
      objects: Array<{ left: number }>;
    };
    expect(loaded.objects[0]?.left).toBe(1);
  });
});
