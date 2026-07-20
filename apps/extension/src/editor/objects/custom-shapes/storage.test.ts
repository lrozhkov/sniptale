import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteEditorCustomShape: vi.fn(),
  listEditorCustomShapes: vi.fn(),
  saveEditorCustomShape: vi.fn(),
  setEditorCustomShapeEnabled: vi.fn(),
}));

vi.mock('./persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./persistence')>()),
  deleteEditorCustomShape: mocks.deleteEditorCustomShape,
  listEditorCustomShapes: mocks.listEditorCustomShapes,
  saveEditorCustomShape: mocks.saveEditorCustomShape,
  setEditorCustomShapeEnabled: mocks.setEditorCustomShapeEnabled,
}));

import {
  deleteCustomShapeDefinition,
  disableCustomShapeDefinition,
  loadCustomShapeLibrary,
  saveCustomShapeDefinition,
} from './storage';

const definition = {
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
} as const;

beforeEach(() => {
  vi.clearAllMocks();
});

it('routes editor custom shape storage through the shared db seam', async () => {
  mocks.listEditorCustomShapes.mockResolvedValue([definition]);
  mocks.saveEditorCustomShape.mockResolvedValue(definition);
  mocks.setEditorCustomShapeEnabled.mockResolvedValue(true);

  await expect(loadCustomShapeLibrary()).resolves.toEqual([definition]);
  await expect(saveCustomShapeDefinition(definition, 'badge.svg')).resolves.toEqual(definition);
  await expect(disableCustomShapeDefinition('custom-badge')).resolves.toBe(true);
  await deleteCustomShapeDefinition('custom-badge');

  expect(mocks.saveEditorCustomShape).toHaveBeenCalledWith(definition, {
    sourceFileName: 'badge.svg',
  });
  expect(mocks.setEditorCustomShapeEnabled).toHaveBeenCalledWith('custom-badge', false);
  expect(mocks.deleteEditorCustomShape).toHaveBeenCalledWith('custom-badge');
});
