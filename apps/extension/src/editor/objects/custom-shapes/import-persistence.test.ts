import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteCustomShapeDefinition: vi.fn(),
  disableCustomShapeDefinition: vi.fn(),
  loadCustomShapeLibrary: vi.fn(),
  saveCustomShapeDefinition: vi.fn(),
}));

vi.mock('./storage', () => ({
  deleteCustomShapeDefinition: mocks.deleteCustomShapeDefinition,
  disableCustomShapeDefinition: mocks.disableCustomShapeDefinition,
  loadCustomShapeLibrary: mocks.loadCustomShapeLibrary,
  saveCustomShapeDefinition: mocks.saveCustomShapeDefinition,
}));

import { saveCustomShapeDefinitionsWithRollback } from './import-persistence';

function createDefinition(id = 'custom-badge') {
  return {
    id,
    label: id,
    category: 'custom',
    tags: ['custom'],
    capabilities: ['fill', 'line', 'effects'],
    geometry: {
      type: 'path',
      viewBox: { minX: 0, minY: 0, width: 10, height: 10 },
      paths: [{ commands: [['M', 0, 0] as const, ['L', 10, 10] as const] }],
    },
  } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteCustomShapeDefinition.mockResolvedValue(undefined);
  mocks.disableCustomShapeDefinition.mockResolvedValue(true);
  mocks.loadCustomShapeLibrary.mockResolvedValue([]);
  mocks.saveCustomShapeDefinition.mockResolvedValue(createDefinition());
});

it('saves imported custom shapes sequentially', async () => {
  const first = createDefinition('custom-first');
  const second = createDefinition('custom-second');

  await saveCustomShapeDefinitionsWithRollback([first, second], 'library.excalidrawlib');

  expect(mocks.saveCustomShapeDefinition.mock.calls).toEqual([
    [first, 'library.excalidrawlib'],
    [second, 'library.excalidrawlib'],
  ]);
});

it('cleans up newly saved shapes when a later save fails', async () => {
  mocks.saveCustomShapeDefinition
    .mockResolvedValueOnce(createDefinition('custom-first'))
    .mockRejectedValueOnce(new Error('save failed'));

  await expect(
    saveCustomShapeDefinitionsWithRollback(
      [createDefinition('custom-first'), createDefinition('custom-second')],
      'library.excalidrawlib'
    )
  ).rejects.toThrow('save failed');

  expect(mocks.deleteCustomShapeDefinition).toHaveBeenCalledWith('custom-first');
});

it('restores overwritten disabled shapes when a later save fails', async () => {
  const previous = {
    ...createDefinition('custom-first'),
    createdAt: 1,
    enabled: false,
    sourceFileName: 'previous.svg',
    updatedAt: 2,
  };
  mocks.loadCustomShapeLibrary.mockResolvedValue([previous]);
  mocks.saveCustomShapeDefinition
    .mockResolvedValueOnce(createDefinition('custom-first'))
    .mockRejectedValueOnce(new Error('save failed'))
    .mockResolvedValueOnce(previous);

  await expect(
    saveCustomShapeDefinitionsWithRollback(
      [createDefinition('custom-first'), createDefinition('custom-second')],
      'library.excalidrawlib'
    )
  ).rejects.toThrow('save failed');

  expect(mocks.saveCustomShapeDefinition).toHaveBeenLastCalledWith(previous, 'previous.svg');
  expect(mocks.disableCustomShapeDefinition).toHaveBeenCalledWith('custom-first');
});

it('restores overwritten shapes with explicit null source file names', async () => {
  const previous = {
    ...createDefinition('custom-first'),
    createdAt: 1,
    enabled: true,
    sourceFileName: null,
    updatedAt: 2,
  };
  mocks.loadCustomShapeLibrary.mockResolvedValue([previous]);
  mocks.saveCustomShapeDefinition
    .mockResolvedValueOnce(createDefinition('custom-first'))
    .mockRejectedValueOnce(new Error('save failed'))
    .mockResolvedValueOnce(previous);

  await expect(
    saveCustomShapeDefinitionsWithRollback(
      [createDefinition('custom-first'), createDefinition('custom-second')],
      'library.excalidrawlib'
    )
  ).rejects.toThrow('save failed');

  expect(mocks.saveCustomShapeDefinition).toHaveBeenLastCalledWith(previous, null);
});
