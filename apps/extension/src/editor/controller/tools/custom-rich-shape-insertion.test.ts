import { beforeEach, expect, it, vi } from 'vitest';

const { createRichShapeObjectMock } = vi.hoisted(() => ({
  createRichShapeObjectMock: vi.fn(),
}));

vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  createRichShapeObject: createRichShapeObjectMock,
}));

import { createCustomRichShapeInsertionObject } from './custom-rich-shape-insertion';

function createDefinition() {
  return {
    id: 'custom-badge',
    label: 'Badge',
    category: 'custom',
    tags: ['badge'],
    capabilities: ['fill', 'line', 'effects'],
    geometry: {
      type: 'path',
      viewBox: { minX: 0, minY: 0, width: 20, height: 10 },
      paths: [
        {
          commands: [
            ['M', 0, 0],
            ['L', 20, 10],
          ],
        },
      ],
    },
  } as const;
}

function createImportedDefinition() {
  const source = {
    type: 'manual-excalidraw-import',
    name: 'Imported arrow',
    libraryId: 'library-1',
    itemId: 'item-1',
    importedAt: null,
    formatVersion: '2',
  } as const;

  return {
    ...createDefinition(),
    source,
    richShapeDefaults: {
      shapeFamily: 'arrow',
      shapeKind: 'line-arrow',
      rough: {
        enabled: true,
        seed: 12,
        roughness: 2,
        bowing: 1,
        fillStyle: 'hachure',
        hachureGap: 8,
        hachureAngle: -41,
        fillWeight: 1,
        fillRoughness: 2,
        fillBowing: 1,
        fillTransparency: 0,
        preserveVertices: true,
      },
      source,
    },
  } as const;
}

beforeEach(() => {
  createRichShapeObjectMock.mockReset();
  createRichShapeObjectMock.mockReturnValue({ id: 'custom-rich-shape' });
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') });
});

it('creates custom rich shape objects with embedded geometry for save and restore', () => {
  const definition = createDefinition();
  const object = createCustomRichShapeInsertionObject({
    customDefinition: definition,
    nextLabelIndex: 2,
    prepareObject: vi.fn(),
    shapeId: 'custom-badge',
    source: { left: 5, top: 8 } as never,
  });

  expect(createRichShapeObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'uuid-1',
      shapeFamily: 'custom',
      shapeKind: 'custom-badge',
      geometry: definition.geometry,
      frame: expect.objectContaining({ left: 45, top: 48, width: 20, height: 10 }),
      source: expect.objectContaining({ itemId: 'custom-badge', name: 'Badge', type: 'custom' }),
    }),
    definition.geometry,
    'Badge 2'
  );
  expect(object).toEqual({ id: 'custom-rich-shape' });
});

it('applies imported rich shape defaults when inserting custom definitions', () => {
  const definition = createImportedDefinition();

  createCustomRichShapeInsertionObject({
    customDefinition: definition,
    height: 6,
    nextLabelIndex: 3,
    prepareObject: vi.fn(),
    shapeId: 'custom-badge',
    source: { left: 1, top: 2 } as never,
    width: 8,
  });

  expect(createRichShapeObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      shapeFamily: 'arrow',
      shapeKind: 'line-arrow',
      frame: expect.objectContaining({ height: 6, width: 8 }),
      rough: expect.objectContaining({ enabled: true, seed: 12 }),
      source: expect.objectContaining({ type: 'manual-excalidraw-import', itemId: 'item-1' }),
    }),
    definition.geometry,
    'Badge 3'
  );
});

it('returns null for invalid or mismatched custom rich shape definitions', () => {
  expect(
    createCustomRichShapeInsertionObject({
      customDefinition: { ...createDefinition(), id: 'custom-other' },
      nextLabelIndex: 1,
      prepareObject: vi.fn(),
      shapeId: 'custom-badge',
      source: { left: 0, top: 0 } as never,
    })
  ).toBeNull();
  expect(
    createCustomRichShapeInsertionObject({
      customDefinition: { id: 'broken' },
      nextLabelIndex: 1,
      prepareObject: vi.fn(),
      shapeId: 'broken',
      source: { left: 0, top: 0 } as never,
    })
  ).toBeNull();
});
