// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadCustomShapeLibrary: vi.fn(),
  saveCustomShapeDefinition: vi.fn(),
  deleteCustomShapeDefinition: vi.fn(),
  disableCustomShapeDefinition: vi.fn(),
  parseCustomShapeImport: vi.fn(),
}));

vi.mock('../../../objects/custom-shapes/storage', () => ({
  loadCustomShapeLibrary: mocks.loadCustomShapeLibrary,
  saveCustomShapeDefinition: mocks.saveCustomShapeDefinition,
  deleteCustomShapeDefinition: mocks.deleteCustomShapeDefinition,
  disableCustomShapeDefinition: mocks.disableCustomShapeDefinition,
}));

vi.mock('../../../objects/custom-shapes/importer', () => ({
  parseCustomShapeImport: mocks.parseCustomShapeImport,
}));
import { useShapeBrowserCustomShapes } from './custom-shapes';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useShapeBrowserCustomShapes> | null = null;

function Harness() {
  latestState = useShapeBrowserCustomShapes();
  return null;
}

function createItem() {
  return {
    id: 'custom-badge',
    label: 'Badge',
    category: 'custom',
    tags: ['badge'],
    capabilities: ['fill', 'line', 'effects'],
    enabled: true,
    createdAt: 1,
    updatedAt: 2,
    sourceFileName: 'badge.svg',
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
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latestState = null;
  mocks.loadCustomShapeLibrary.mockResolvedValue([createItem()]);
  mocks.saveCustomShapeDefinition.mockResolvedValue(createItem());
  mocks.deleteCustomShapeDefinition.mockResolvedValue(undefined);
  mocks.disableCustomShapeDefinition.mockResolvedValue(true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderHarness() {
  await act(async () => {
    root?.render(<Harness />);
  });
}

function createFile(name: string, type: string, text: string): File {
  const file = new File([text], name, { type });
  Object.defineProperty(file, 'text', { value: vi.fn(async () => text) });
  return file;
}

it('loads custom shapes and maps enabled items into browser entries', async () => {
  await renderHarness();

  expect(latestState?.entries).toEqual([
    expect.objectContaining({
      id: 'custom-badge',
      source: 'custom',
      customDefinition: expect.objectContaining({ id: 'custom-badge' }),
    }),
  ]);
  expect(latestState?.importState).toEqual({ status: 'ready' });
});

it('maps manual Excalidraw imports into imported-library browser entries', async () => {
  mocks.loadCustomShapeLibrary.mockResolvedValueOnce([
    {
      ...createItem(),
      source: {
        type: 'manual-excalidraw-import',
        name: 'Flow',
        libraryId: 'library-1',
        itemId: 'item-1',
        importedAt: null,
        formatVersion: '2',
      },
    },
  ]);
  await renderHarness();

  expect(latestState?.entries).toEqual([
    expect.objectContaining({
      category: 'imported',
      source: 'imported-library',
      customDefinition: expect.objectContaining({
        source: expect.objectContaining({ type: 'manual-excalidraw-import' }),
      }),
    }),
  ]);
});

it('imports valid custom shape files through the editor persistence seam', async () => {
  const item = createItem();
  mocks.parseCustomShapeImport.mockReturnValue({
    ok: true,
    definition: item,
    definitions: [item],
    diagnostics: [],
  });
  await renderHarness();

  await act(async () => {
    await latestState?.importFile(createFile('badge.json', 'application/json', '{}'));
  });

  expect(mocks.saveCustomShapeDefinition).toHaveBeenCalledWith(item, 'badge.json');
  expect(mocks.loadCustomShapeLibrary).toHaveBeenCalledTimes(3);
  expect(latestState?.importState).toEqual({
    status: 'ready',
    summary: expect.objectContaining({
      importedCount: 1,
      sourceFileName: 'badge.json',
      validationErrorCount: 0,
    }),
  });
});

it('persists every definition returned by a multi-item import', async () => {
  const first = createItem();
  const second = { ...createItem(), id: 'custom-second', label: 'Second' };
  mocks.parseCustomShapeImport.mockReturnValue({
    ok: true,
    definition: first,
    definitions: [first, second],
    diagnostics: [],
  });
  await renderHarness();

  await act(async () => {
    await latestState?.importFile(createFile('library.excalidrawlib', 'application/json', '{}'));
  });

  expect(mocks.saveCustomShapeDefinition).toHaveBeenCalledWith(first, 'library.excalidrawlib');
  expect(mocks.saveCustomShapeDefinition).toHaveBeenCalledWith(second, 'library.excalidrawlib');
});

it('keeps previous import diagnostics visible when a reload has no enabled shapes', async () => {
  mocks.parseCustomShapeImport.mockReturnValue({
    ok: false,
    diagnostics: [{ code: 'invalid-json', message: 'bad json', severity: 'error' }],
  });
  await renderHarness();

  await act(async () => {
    await latestState?.importFile(createFile('bad.json', 'application/json', '{}'));
  });
  mocks.loadCustomShapeLibrary.mockResolvedValueOnce([]);
  await act(async () => {
    await latestState?.deleteShape('custom-badge');
  });

  expect(latestState?.entries).toEqual([]);
  expect(latestState?.importState).toEqual({
    status: 'error',
    summary: expect.objectContaining({
      importedCount: 0,
      sourceFileName: 'bad.json',
      validationErrorCount: 1,
    }),
  });
});

it('surfaces invalid imports and mutation failures as import state errors', async () => {
  mocks.parseCustomShapeImport.mockReturnValue({
    ok: false,
    diagnostics: [{ code: 'invalid-json', message: 'bad json', severity: 'error' }],
  });
  await renderHarness();

  await act(async () => {
    await latestState?.importFile(createFile('bad.json', 'application/json', '{'));
  });
  expect(latestState?.importState).toEqual({
    status: 'error',
    summary: expect.objectContaining({
      diagnostics: [{ code: 'invalid-json', severity: 'error' }],
      validationErrorCount: 1,
    }),
  });

  mocks.deleteCustomShapeDefinition.mockRejectedValueOnce(new Error('delete failed'));
  await act(async () => {
    await latestState?.deleteShape('custom-badge');
  });
  expect(latestState?.importState).toEqual({ status: 'error', message: 'delete failed' });
});

it('disables and deletes custom shapes through storage actions', async () => {
  await renderHarness();

  await act(async () => {
    await latestState?.disableShape('custom-badge');
    await latestState?.deleteShape('custom-badge');
  });

  expect(mocks.disableCustomShapeDefinition).toHaveBeenCalledWith('custom-badge');
  expect(mocks.deleteCustomShapeDefinition).toHaveBeenCalledWith('custom-badge');
});

it('surfaces file read and save failures as import state errors', async () => {
  await renderHarness();

  await act(async () => {
    await latestState?.importFile(
      createFile('broken.json', 'application/json', Promise.reject('read failed') as never)
    );
  });
  expect(latestState?.importState).toEqual({ status: 'error', message: 'read failed' });

  mocks.parseCustomShapeImport.mockReturnValue({
    ok: true,
    definition: createItem(),
    definitions: [createItem()],
    diagnostics: [],
  });
  mocks.saveCustomShapeDefinition.mockRejectedValueOnce('save failed');
  await act(async () => {
    await latestState?.importFile(createFile('badge.json', 'application/json', '{}'));
  });
  expect(latestState?.importState).toEqual({ status: 'error', message: 'save failed' });
});

it('surfaces initial load and disable failures as import state errors', async () => {
  mocks.loadCustomShapeLibrary.mockRejectedValueOnce(new Error('load failed'));
  await renderHarness();

  expect(latestState?.importState).toEqual({ status: 'error', message: 'load failed' });

  mocks.disableCustomShapeDefinition.mockRejectedValueOnce(new Error('disable failed'));
  await act(async () => {
    await latestState?.disableShape('custom-badge');
  });
  expect(latestState?.importState).toEqual({ status: 'error', message: 'disable failed' });
});

it('ignores an initial load result after the browser unmounts', async () => {
  let resolveItems: ((items: readonly ReturnType<typeof createItem>[]) => void) | null = null;
  mocks.loadCustomShapeLibrary.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveItems = resolve;
    })
  );

  await act(async () => {
    root?.render(<Harness />);
  });
  act(() => {
    root?.unmount();
  });
  await act(async () => {
    resolveItems?.([createItem()]);
  });

  expect(latestState?.entries).toEqual([]);
});
