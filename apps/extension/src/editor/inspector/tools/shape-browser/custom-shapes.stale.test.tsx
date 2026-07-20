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

function createItem(id = 'custom-badge', label = 'Badge') {
  return {
    id,
    label,
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

async function renderHarness() {
  await act(async () => {
    root?.render(<Harness />);
  });
}

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

function createFile(name: string, type: string, text: string): File {
  return { name, type, text: vi.fn(async () => text) } as unknown as File;
}

it('ignores stale import reads when a newer import starts first', async () => {
  let resolveFirst: ((text: string) => void) | null = null;
  const second = createItem('custom-second', 'Second');
  mocks.parseCustomShapeImport.mockReturnValue({
    ok: true,
    definition: second,
    definitions: [second],
    diagnostics: [],
  });
  await renderHarness();

  let firstImport: Promise<void> | undefined;
  act(() => {
    firstImport = latestState?.importFile({
      name: 'first.json',
      type: 'application/json',
      text: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve;
          })
      ),
    } as unknown as File);
  });
  await act(async () => {
    await latestState?.importFile(createFile('second.json', 'application/json', '{}'));
  });
  await act(async () => {
    resolveFirst?.('{}');
    await firstImport;
  });

  expect(mocks.parseCustomShapeImport).toHaveBeenCalledOnce();
  expect(mocks.saveCustomShapeDefinition).toHaveBeenCalledWith(second, 'second.json');
  expect(mocks.saveCustomShapeDefinition).not.toHaveBeenCalledWith(
    expect.objectContaining({ id: 'custom-badge' }),
    'first.json'
  );
  expect(latestState?.importState).toEqual(
    expect.objectContaining({
      status: 'ready',
      summary: expect.objectContaining({ sourceFileName: 'second.json' }),
    })
  );
});

it('surfaces current initial-load and import-read failures', async () => {
  mocks.loadCustomShapeLibrary.mockRejectedValueOnce(new Error('load failed'));
  await renderHarness();

  expect(latestState?.importState).toEqual({ status: 'error', message: 'load failed' });

  await act(async () => {
    await latestState?.importFile({
      name: 'broken.json',
      type: 'application/json',
      text: vi.fn(async () => {
        throw new Error('read failed');
      }),
    } as unknown as File);
  });

  expect(latestState?.importState).toEqual({ status: 'error', message: 'read failed' });
});

it('surfaces current invalid import diagnostics without mutating storage', async () => {
  mocks.parseCustomShapeImport.mockReturnValue({
    ok: false,
    diagnostics: [{ code: 'invalid-json', message: 'bad json', severity: 'error' }],
  });
  await renderHarness();

  await act(async () => {
    await latestState?.importFile(createFile('bad.json', 'application/json', '{'));
  });

  expect(mocks.saveCustomShapeDefinition).not.toHaveBeenCalled();
  expect(latestState?.importState).toEqual({
    status: 'error',
    summary: expect.objectContaining({ validationErrorCount: 1 }),
  });
});

it('surfaces current delete and disable failures', async () => {
  await renderHarness();

  mocks.deleteCustomShapeDefinition.mockRejectedValueOnce(new Error('delete failed'));
  await act(async () => {
    await latestState?.deleteShape('custom-badge');
  });
  expect(latestState?.importState).toEqual({ status: 'error', message: 'delete failed' });

  mocks.disableCustomShapeDefinition.mockRejectedValueOnce(new Error('disable failed'));
  await act(async () => {
    await latestState?.disableShape('custom-badge');
  });
  expect(latestState?.importState).toEqual({ status: 'error', message: 'disable failed' });
});

it('ignores initial-load results when a newer import starts first', async () => {
  let resolveInitialLoad: ((items: readonly ReturnType<typeof createItem>[]) => void) | null = null;
  const imported = createItem('custom-imported', 'Imported');
  mocks.loadCustomShapeLibrary.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveInitialLoad = resolve;
    })
  );
  mocks.parseCustomShapeImport.mockReturnValue({
    ok: true,
    definition: imported,
    definitions: [imported],
    diagnostics: [],
  });
  await renderHarness();

  await act(async () => {
    await latestState?.importFile(createFile('imported.json', 'application/json', '{}'));
  });
  await act(async () => {
    resolveInitialLoad?.([createItem('custom-stale', 'Stale')]);
  });

  expect(latestState?.importState).toEqual(
    expect.objectContaining({
      status: 'ready',
      summary: expect.objectContaining({ sourceFileName: 'imported.json' }),
    })
  );
});

it('ignores stale reload results after a newer mutation starts', async () => {
  let resolveDeleteReload: ((items: readonly ReturnType<typeof createItem>[]) => void) | null =
    null;
  await renderHarness();
  mocks.loadCustomShapeLibrary
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDeleteReload = resolve;
      })
    )
    .mockResolvedValueOnce([createItem('custom-current', 'Current')]);

  let deleteRequest: Promise<void> | undefined;
  act(() => {
    deleteRequest = latestState?.deleteShape('custom-badge');
  });
  await act(async () => {
    await latestState?.disableShape('custom-current');
  });
  await act(async () => {
    resolveDeleteReload?.([createItem('custom-stale', 'Stale')]);
    await deleteRequest;
  });

  expect(latestState?.entries).toEqual([
    expect.objectContaining({ id: 'custom-current', labelFallback: 'Current' }),
  ]);
});
