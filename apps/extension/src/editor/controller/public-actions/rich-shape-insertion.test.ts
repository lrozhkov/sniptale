import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyRichShapeDocumentObjectToObjectMock: vi.fn(),
  createEnabledRichShapeRoughStyleMock: vi.fn(() => ({ enabled: true, seed: 10 })),
  createCustomRichShapeInsertionObjectMock: vi.fn(),
  createRichShapeCatalogInsertionObjectMock: vi.fn(),
  isRichShapeObjectMock: vi.fn(() => false),
}));

vi.mock('../tools/insertions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/insertions')>()),
  createRichShapeCatalogInsertionObject: mocks.createRichShapeCatalogInsertionObjectMock,
}));

vi.mock('../tools/custom-rich-shape-insertion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tools/custom-rich-shape-insertion')>()),
  createCustomRichShapeInsertionObject: mocks.createCustomRichShapeInsertionObjectMock,
}));

vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  applyRichShapeDocumentObjectToObject: mocks.applyRichShapeDocumentObjectToObjectMock,
  isRichShapeObject: mocks.isRichShapeObjectMock,
}));

vi.mock('../../../features/editor/document/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../features/editor/document/rich-shape')>()),
  createEnabledRichShapeRoughStyle: mocks.createEnabledRichShapeRoughStyleMock,
}));

import { insertEditorRichShapeObject } from './rich-shape';
import { insertEditorControllerRichShapeWithOptions } from '../public-api/rich-shape-insertion';

function createCanvas() {
  return {
    add: vi.fn(),
    requestRenderAll: vi.fn(),
    setActiveObject: vi.fn(),
  };
}

function createSource() {
  return {
    dataUrl: 'data:image/png;base64,source',
    displayHeight: 200,
    displayWidth: 300,
    id: 'source-image-layer',
    intrinsicHeight: 200,
    intrinsicWidth: 300,
    left: 0,
    locked: true,
    name: 'source',
    top: 0,
    visible: true,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createCustomRichShapeInsertionObjectMock.mockReturnValue({ id: 'custom-rich-shape' });
});

it('no-ops rich shape insertion when the canvas source is unavailable', () => {
  insertEditorRichShapeObject({
    canvas: null,
    commitHistory: vi.fn(),
    nextLabelIndex: vi.fn(() => 2),
    prepareObject: vi.fn(),
    shapeId: 'arrow',
    source: null,
    syncRuntimeState: vi.fn(),
  });

  expect(mocks.createRichShapeCatalogInsertionObjectMock).not.toHaveBeenCalled();
});

it('routes rough insertions through the public api helper payload', () => {
  const canvas = createCanvas();
  const shape = { id: 'rich-shape' };
  const prepareObject = vi.fn();
  const nextLabelIndex = vi.fn(() => 4);
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();

  mocks.createRichShapeCatalogInsertionObjectMock.mockImplementation((options) => {
    options.prepareObject(shape as never);

    return shape;
  });

  insertEditorControllerRichShapeWithOptions(
    {
      canvas,
      commitHistory,
      nextLabelIndex,
      prepareObject,
      source: createSource(),
      syncRuntimeState,
    } as never,
    'block-arrow',
    { rough: true }
  );

  expect(prepareObject).toHaveBeenCalledWith(shape);
  expect(nextLabelIndex).toHaveBeenCalledWith('rich-shape');
  expect(commitHistory).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
});

it('passes custom shape definitions through the public api helper payload', () => {
  const customDefinition = {
    id: 'custom-badge',
    label: 'Badge',
    category: 'custom',
    tags: ['badge'],
    capabilities: ['fill', 'line', 'effects'],
    geometry: {
      type: 'path',
      viewBox: { minX: 0, minY: 0, width: 10, height: 10 },
      paths: [
        {
          commands: [
            ['M', 0, 0],
            ['L', 10, 10],
          ],
        },
      ],
    },
  };

  insertEditorControllerRichShapeWithOptions(
    {
      canvas: createCanvas(),
      commitHistory: vi.fn(),
      nextLabelIndex: vi.fn(() => 4),
      prepareObject: vi.fn(),
      source: createSource(),
      syncRuntimeState: vi.fn(),
    } as never,
    'custom-badge',
    { customDefinition, rough: true }
  );

  expect(mocks.createCustomRichShapeInsertionObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      customDefinition,
      shapeId: 'custom-badge',
    })
  );
});

it('inserts catalog rich shapes and syncs the editor runtime', () => {
  const canvas = createCanvas();
  const shape = { id: 'rich-shape' };
  const commitHistory = vi.fn();
  const syncRuntimeState = vi.fn();
  const prepareObject = vi.fn();

  mocks.createRichShapeCatalogInsertionObjectMock.mockReturnValue(shape);

  insertEditorRichShapeObject({
    canvas: canvas as never,
    commitHistory,
    nextLabelIndex: vi.fn(() => 6),
    prepareObject,
    rough: true,
    shapeId: 'block-arrow',
    source: createSource(),
    syncRuntimeState,
  });

  expect(mocks.createRichShapeCatalogInsertionObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      nextLabelIndex: 6,
      prepareObject,
      shapeId: 'block-arrow',
    })
  );
  expect(canvas.add).toHaveBeenCalledWith(shape);
  expect(canvas.setActiveObject).toHaveBeenCalledWith(shape);
  expect(commitHistory).toHaveBeenCalledOnce();
  expect(syncRuntimeState).toHaveBeenCalledOnce();
});

it('enables rough style before inserting rough catalog rich shapes', () => {
  const canvas = createCanvas();
  const shape = {
    id: 'rich-shape',
    sniptaleRichShape: { id: 'shape-id', rough: { enabled: false } },
    sniptaleType: 'rich-shape',
  };

  mocks.createRichShapeCatalogInsertionObjectMock.mockReturnValue(shape);
  mocks.isRichShapeObjectMock.mockReturnValue(true);

  insertEditorRichShapeObject({
    canvas: canvas as never,
    commitHistory: vi.fn(),
    nextLabelIndex: vi.fn(() => 6),
    prepareObject: vi.fn(),
    rough: true,
    shapeId: 'block-arrow',
    source: createSource(),
    syncRuntimeState: vi.fn(),
  });

  expect(mocks.createEnabledRichShapeRoughStyleMock).toHaveBeenCalledWith('shape-id');
  expect(mocks.applyRichShapeDocumentObjectToObjectMock).toHaveBeenCalledWith(
    shape,
    expect.objectContaining({ rough: { enabled: true, seed: 10 } })
  );
});

it('merges custom rough defaults when rough custom shapes are inserted', () => {
  const shape = {
    id: 'rich-shape',
    sniptaleRichShape: { id: 'shape-id', rough: { enabled: false } },
    sniptaleType: 'rich-shape',
  };

  mocks.createCustomRichShapeInsertionObjectMock.mockReturnValue(shape);
  mocks.isRichShapeObjectMock.mockReturnValue(true);

  insertEditorRichShapeObject({
    canvas: createCanvas() as never,
    commitHistory: vi.fn(),
    customDefinition: {
      id: 'custom-badge',
      label: 'Badge',
      geometry: {
        type: 'path',
        viewBox: { minX: 0, minY: 0, width: 10, height: 10 },
        paths: [
          {
            commands: [
              ['M', 0, 0],
              ['L', 10, 10],
            ],
          },
        ],
      },
      roughDefaults: { roughness: 2.5 },
    } as never,
    nextLabelIndex: vi.fn(() => 6),
    prepareObject: vi.fn(),
    rough: true,
    shapeId: 'custom-badge',
    source: createSource(),
    syncRuntimeState: vi.fn(),
  });

  expect(mocks.applyRichShapeDocumentObjectToObjectMock).toHaveBeenCalledWith(
    shape,
    expect.objectContaining({ rough: expect.objectContaining({ roughness: 2.5 }) })
  );
});
