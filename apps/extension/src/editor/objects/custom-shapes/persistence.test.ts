import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type EditorCustomShapeDefinition } from '../../../features/editor/document/rich-shape';

const dbState = vi.hoisted(() => ({
  entries: new Map<string, unknown>(),
}));

vi.mock('../../../composition/persistence/infrastructure/indexed-db/core', () => ({
  EDITOR_CUSTOM_SHAPES_STORE: 'editor_custom_shapes',
  initDB: vi.fn(async () => ({
    get: vi.fn(async (_store: string, id: string) => dbState.entries.get(id)),
    getAll: vi.fn(async () => [...dbState.entries.values()]),
    put: vi.fn(async (_store: string, entry: { id: string }) => {
      dbState.entries.set(entry.id, structuredClone(entry));
    }),
    delete: vi.fn(async (_store: string, id: string) => {
      dbState.entries.delete(id);
    }),
  })),
}));

import {
  deleteEditorCustomShape,
  listEditorCustomShapes,
  saveEditorCustomShape,
  setEditorCustomShapeEnabled,
} from './persistence';

function createDefinition(): EditorCustomShapeDefinition {
  return {
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
}

beforeEach(() => {
  dbState.entries.clear();
  vi.spyOn(Date, 'now').mockReturnValue(1000);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('editor custom shapes db', () => {
  it('round-trips custom shapes and supports disable and delete', async () => {
    await saveEditorCustomShape(createDefinition(), { sourceFileName: 'badge.svg' });

    expect(await listEditorCustomShapes()).toEqual([
      expect.objectContaining({
        id: 'custom-badge',
        enabled: true,
        sourceFileName: 'badge.svg',
      }),
    ]);

    await setEditorCustomShapeEnabled('custom-badge', false);
    expect(await listEditorCustomShapes()).toEqual([
      expect.objectContaining({ id: 'custom-badge', enabled: false }),
    ]);

    await deleteEditorCustomShape('custom-badge');
    expect(await listEditorCustomShapes()).toEqual([]);
  });

  it('distinguishes omitted and explicit null source file names', async () => {
    await saveEditorCustomShape(createDefinition(), { sourceFileName: 'badge.svg' });
    await saveEditorCustomShape({ ...createDefinition(), label: 'Badge updated' });
    expect(await listEditorCustomShapes()).toEqual([
      expect.objectContaining({ label: 'Badge updated', sourceFileName: 'badge.svg' }),
    ]);

    await saveEditorCustomShape(
      { ...createDefinition(), label: 'Badge restored' },
      {
        sourceFileName: null,
      }
    );
    expect(await listEditorCustomShapes()).toEqual([
      expect.objectContaining({ label: 'Badge restored', sourceFileName: null }),
    ]);
  });
});
