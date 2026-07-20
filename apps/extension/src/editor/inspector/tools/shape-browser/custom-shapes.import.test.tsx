// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteCustomShapeDefinition: vi.fn(),
  disableCustomShapeDefinition: vi.fn(),
  loadCustomShapeLibrary: vi.fn(),
  parseCustomShapeImport: vi.fn(),
  saveCustomShapeDefinition: vi.fn(),
}));

vi.mock('../../../objects/custom-shapes/storage', () => ({
  deleteCustomShapeDefinition: mocks.deleteCustomShapeDefinition,
  disableCustomShapeDefinition: mocks.disableCustomShapeDefinition,
  loadCustomShapeLibrary: mocks.loadCustomShapeLibrary,
  saveCustomShapeDefinition: mocks.saveCustomShapeDefinition,
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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  latestState = null;
  mocks.loadCustomShapeLibrary.mockResolvedValue([]);
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

function createOversizedFile(): File {
  const file = new File(['<svg />'], 'huge.svg', { type: 'image/svg+xml' });
  Object.defineProperties(file, {
    size: { value: 2 * 1024 * 1024 + 1 },
    text: { value: vi.fn(async () => '<svg />') },
  });
  return file;
}

it('rejects oversized custom shape files before reading contents', async () => {
  const file = createOversizedFile();
  await renderHarness();

  await act(async () => {
    await latestState?.importFile(file);
  });

  expect(file.text).not.toHaveBeenCalled();
  expect(mocks.parseCustomShapeImport).not.toHaveBeenCalled();
  expect(mocks.saveCustomShapeDefinition).not.toHaveBeenCalled();
  expect(latestState?.importState).toEqual({
    status: 'error',
    message: 'Custom shape import file is too large.',
  });
});
