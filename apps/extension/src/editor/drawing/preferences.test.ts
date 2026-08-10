import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createDefaultDrawingToolDefaults,
  type DrawingToolDefaults,
} from '../../features/drawing/public';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  showToast: vi.fn(),
  subscribe: vi.fn(
    (_fallback: DrawingToolDefaults, _listener: (defaults: DrawingToolDefaults) => void) => () =>
      undefined
  ),
}));

vi.mock(
  '../../composition/persistence/drawing-palette/tool-preferences',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../composition/persistence/drawing-palette/tool-preferences')
    >()),
    loadDrawingToolPreferences: mocks.load,
    saveDrawingToolPreferences: mocks.save,
    subscribeToDrawingToolPreferences: mocks.subscribe,
  })
);
vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  showToast: mocks.showToast,
}));
vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { useEditorStore } from '../state/useEditorStore';
import { synchronizeEditorDrawingPreferences } from './preferences';

let stop: (() => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  useEditorStore.getState().replaceDrawingToolSettings(createDefaultDrawingToolDefaults());
  mocks.save.mockResolvedValue('applied');
});

afterEach(() => {
  stop?.();
  stop = undefined;
});

it('reconciles delayed hydration without overwriting a newer editor choice', async () => {
  const authoritative = createDefaultDrawingToolDefaults();
  let resolveLoad: ((defaults: DrawingToolDefaults) => void) | undefined;
  mocks.load.mockReturnValue(
    new Promise((resolve) => {
      resolveLoad = resolve;
    })
  );
  stop = synchronizeEditorDrawingPreferences();

  useEditorStore.getState().updateDrawingToolSettings('pencil', { width: 16 });
  resolveLoad?.(authoritative);

  await vi.waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      { pencil: { ...authoritative.pencil, width: 16 } },
      authoritative
    )
  );
  expect(useEditorStore.getState().toolSettings.pencil.width).toBe(16);

  const external = {
    ...authoritative,
    marker: { ...authoritative.marker, opacity: 0.6 },
    pencil: { ...authoritative.pencil, width: 16 },
  };
  mocks.subscribe.mock.calls.at(-1)?.[1]?.(external);
  expect(useEditorStore.getState().toolSettings).toMatchObject({
    marker: { opacity: 0.6 },
    pencil: { width: 16 },
  });
});

it('surfaces rejected durable writes while keeping the editor preference', async () => {
  const defaults = createDefaultDrawingToolDefaults();
  mocks.load.mockResolvedValue(defaults);
  mocks.save.mockResolvedValue('rejected');
  stop = synchronizeEditorDrawingPreferences();
  await vi.waitFor(() => expect(mocks.load).toHaveBeenCalled());

  useEditorStore.getState().updateDrawingToolSettings('marker', { width: 44 });

  await vi.waitFor(() => expect(mocks.showToast).toHaveBeenCalledOnce());
  expect(mocks.showToast).toHaveBeenCalledWith(
    'content.toolbar.drawingPreferencesSaveError',
    'error'
  );
  expect(useEditorStore.getState().toolSettings.marker.width).toBe(44);
});
