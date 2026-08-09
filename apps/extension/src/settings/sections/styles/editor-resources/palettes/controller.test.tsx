// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
const storage = vi.hoisted(() => vi.fn());
const palettePersistence = vi.hoisted(() => ({
  change: vi.fn(),
  load: vi.fn(),
  reorder: vi.fn(),
  subscribe: vi.fn(),
}));
const showToast = vi.hoisted(() => vi.fn());
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({ showToast }));
vi.mock('../storage', () => ({ useEditorPresetStorageState: storage }));
vi.mock('./actions', () => ({ createPaletteActions: () => ({ changeColor: vi.fn() }) }));
vi.mock('../../../../../composition/persistence/drawing-palette', () => ({
  createDefaultDrawingPaletteState: () => ({ schemaVersion: 1, colors: ['#123456'] }),
  changeDrawingPaletteColor: palettePersistence.change,
  loadDrawingPaletteState: palettePersistence.load,
  reorderDrawingPaletteColor: palettePersistence.reorder,
  subscribeToDrawingPaletteState: palettePersistence.subscribe,
}));
import { usePalettesController } from './controller';

beforeEach(() => {
  storage.mockReturnValue({
    palette: {
      shapeStroke: ['#123'],
      shapeFill: [],
      textColor: [],
      textBackground: [],
      sceneBackground: [],
    },
  });
  palettePersistence.load.mockResolvedValue({ schemaVersion: 1, colors: ['#123456'] });
  palettePersistence.change.mockResolvedValue('applied');
  palettePersistence.reorder.mockResolvedValue('applied');
  palettePersistence.subscribe.mockReturnValue(() => undefined);
});

it('selects the active palette from the shared storage snapshot', () => {
  let latest: ReturnType<typeof usePalettesController> | undefined;
  function Harness() {
    latest = usePalettesController();
    return null;
  }
  const node = document.createElement('div');
  const root = createRoot(node);
  act(() => root.render(<Harness />));
  expect(latest?.colors).toEqual(['#123456']);
  act(() => latest?.setKey('shapeStroke'));
  expect(latest?.colors).toEqual(['#123']);
  act(() => root.unmount());
});

it('updates and reorders the durable drawing palette', async () => {
  let latest: ReturnType<typeof usePalettesController> | undefined;
  function Harness() {
    latest = usePalettesController();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
  await act(async () => latest?.changeColor(0, '#abcdef'));
  await act(async () => latest?.moveColor(0, null));
  await act(async () => latest?.moveColor(99, null));
  expect(palettePersistence.change).toHaveBeenCalledWith(0, '#abcdef');
  expect(palettePersistence.reorder).toHaveBeenNthCalledWith(1, 0, null);
  expect(palettePersistence.reorder).toHaveBeenNthCalledWith(2, 99, null);
  act(() => root.unmount());
});

it('surfaces rejected and failed drawing palette mutations', async () => {
  palettePersistence.change.mockResolvedValueOnce('rejected');
  palettePersistence.reorder.mockRejectedValueOnce(new Error('storage failed'));
  let latest: ReturnType<typeof usePalettesController> | undefined;
  function Harness() {
    latest = usePalettesController();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
  await act(async () => latest?.changeColor(0, '#abcdef'));
  await act(async () => latest?.moveColor(0, null));
  expect(showToast).toHaveBeenCalledTimes(2);
  expect(showToast).toHaveBeenCalledWith(expect.any(String), 'error');
  act(() => root.unmount());
});

it('keeps an observed palette change when an older load resolves later', async () => {
  let resolveLoad: ((value: { schemaVersion: 1; colors: string[] }) => void) | undefined;
  palettePersistence.load.mockReturnValue(
    new Promise((resolve) => {
      resolveLoad = resolve;
    })
  );
  let observer: ((state: { schemaVersion: 1; colors: string[] }) => void) | undefined;
  palettePersistence.subscribe.mockImplementation((listener) => {
    observer = listener;
    return () => undefined;
  });
  let latest: ReturnType<typeof usePalettesController> | undefined;
  function Harness() {
    latest = usePalettesController();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(<Harness />));
  act(() => observer?.({ schemaVersion: 1, colors: ['#654321'] }));
  await act(async () => resolveLoad?.({ schemaVersion: 1, colors: ['#111111'] }));
  expect(latest?.colors).toEqual(['#654321']);
  act(() => root.unmount());
});
