import { beforeEach, expect, it, vi } from 'vitest';
import {
  createDefaultDrawingToolDefaults,
  createDrawingSession,
  type DrawingToolDefaults,
} from '../../features/drawing/public';

const persistenceMocks = vi.hoisted(() => ({
  loadPalette: vi.fn(),
  loadPreferences: vi.fn(),
  savePreferences: vi.fn(),
  subscribePalette: vi.fn(() => () => undefined),
  subscribePreferences: vi.fn(
    (_fallback: DrawingToolDefaults, _listener: (defaults: DrawingToolDefaults) => void) => () =>
      undefined
  ),
}));

const feedbackMocks = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  showToast: feedbackMocks.showToast,
}));

vi.mock('../../composition/persistence/drawing-palette', () => ({
  loadDrawingPaletteState: persistenceMocks.loadPalette,
  subscribeToDrawingPaletteState: persistenceMocks.subscribePalette,
}));
vi.mock(
  '../../composition/persistence/drawing-palette/tool-preferences',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../composition/persistence/drawing-palette/tool-preferences')
    >()),
    loadDrawingToolPreferences: persistenceMocks.loadPreferences,
    saveDrawingToolPreferences: persistenceMocks.savePreferences,
    subscribeToDrawingToolPreferences: persistenceMocks.subscribePreferences,
  })
);

import { createContentDrawingController, synchronizeContentDrawingPreferences } from './controller';

beforeEach(() => {
  vi.clearAllMocks();
  persistenceMocks.loadPalette.mockResolvedValue({ colors: ['#f97316'], schemaVersion: 1 });
  persistenceMocks.savePreferences.mockResolvedValue('applied');
});

it('restores tool defaults after reload and persists later parameter changes only', async () => {
  const restored = {
    ...createDefaultDrawingToolDefaults(),
    pencil: { color: '#123456', width: 16 },
    marker: { color: '#abcdef', opacity: 1, width: 44 },
  };
  persistenceMocks.loadPreferences.mockResolvedValue(restored);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller = createContentDrawingController(session);
  const stop = synchronizeContentDrawingPreferences(controller);

  await vi.waitFor(() => expect(session.getSnapshot().defaults).toEqual(restored));
  expect(session.getSnapshot().activeTool).toBe('pencil');
  expect(persistenceMocks.savePreferences).not.toHaveBeenCalled();

  session.setActiveTool('marker');
  expect(session.getSnapshot().defaults.pencil).toEqual(restored.pencil);
  expect(persistenceMocks.savePreferences).not.toHaveBeenCalled();

  const changed = {
    ...restored,
    marker: { ...restored.marker, opacity: 0.6 },
  };
  session.setDefaults(changed);
  await vi.waitFor(() =>
    expect(persistenceMocks.savePreferences).toHaveBeenCalledWith(
      { marker: changed.marker },
      restored
    )
  );
  stop();

  persistenceMocks.loadPreferences.mockResolvedValueOnce(changed);
  const reloadedSession = createDrawingSession({ onDocumentCommit: () => true });
  const reloadedController = createContentDrawingController(reloadedSession);
  const stopReloaded = synchronizeContentDrawingPreferences(reloadedController);
  await vi.waitFor(() => expect(reloadedSession.getSnapshot().defaults).toEqual(changed));
  expect(reloadedSession.getSnapshot().activeTool).toBe('pencil');
  stopReloaded();
});

it('surfaces a rejected preference save once while retaining the in-memory choice', async () => {
  const defaults = createDefaultDrawingToolDefaults();
  persistenceMocks.loadPreferences.mockResolvedValue(defaults);
  let resolveSave: ((result: 'rejected') => void) | undefined;
  persistenceMocks.savePreferences.mockReturnValue(
    new Promise((resolve) => {
      resolveSave = resolve;
    })
  );
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller = createContentDrawingController(session);
  const stop = synchronizeContentDrawingPreferences(controller);
  await vi.waitFor(() => expect(session.getSnapshot().defaults).toEqual(defaults));

  const changed = { ...defaults, pencil: { ...defaults.pencil, width: 16 } };
  session.setDefaults(changed);
  const storageListener = persistenceMocks.subscribePreferences.mock.calls.at(-1)?.[1];
  storageListener?.(defaults);
  expect(session.getSnapshot().defaults).toEqual(changed);
  resolveSave?.('rejected');
  await vi.waitFor(() => expect(feedbackMocks.showToast).toHaveBeenCalledOnce());
  expect(feedbackMocks.showToast).toHaveBeenCalledWith(
    'Не удалось сохранить настройки рисования',
    'error'
  );
  expect(session.getSnapshot().defaults).toEqual(changed);
  stop();
});

it('clears an applied same-value retry without discarding a later authoritative update', async () => {
  const defaults = createDefaultDrawingToolDefaults();
  persistenceMocks.loadPreferences.mockResolvedValue(defaults);
  persistenceMocks.savePreferences
    .mockResolvedValueOnce('rejected')
    .mockResolvedValueOnce('applied');
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller = createContentDrawingController(session);
  const stop = synchronizeContentDrawingPreferences(controller);
  await vi.waitFor(() => expect(session.getSnapshot().defaults).toEqual(defaults));

  const failedChoice = { ...defaults, pencil: { ...defaults.pencil, width: 16 } };
  session.setDefaults(failedChoice);
  await vi.waitFor(() => expect(feedbackMocks.showToast).toHaveBeenCalledOnce());
  session.setDefaults(defaults);
  await vi.waitFor(() => expect(persistenceMocks.savePreferences).toHaveBeenCalledTimes(2));

  const external = { ...defaults, pencil: { ...defaults.pencil, width: 8 } };
  const storageListener = persistenceMocks.subscribePreferences.mock.calls.at(-1)?.[1];
  storageListener?.(external);
  expect(session.getSnapshot().defaults).toEqual(external);
  stop();
});

it('retains a newer local tool choice when an older save and notification arrive later', async () => {
  const defaults = createDefaultDrawingToolDefaults();
  persistenceMocks.loadPreferences.mockResolvedValue(defaults);
  let resolveOlderSave: ((result: 'applied') => void) | undefined;
  let resolveNewerSave: ((result: 'applied') => void) | undefined;
  persistenceMocks.savePreferences
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOlderSave = resolve;
      })
    )
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNewerSave = resolve;
      })
    );
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller = createContentDrawingController(session);
  const stop = synchronizeContentDrawingPreferences(controller);
  await vi.waitFor(() => expect(session.getSnapshot().defaults).toEqual(defaults));

  const olderChoice = { ...defaults, pencil: { ...defaults.pencil, width: 8 } };
  const newerChoice = { ...defaults, pencil: { ...defaults.pencil, width: 16 } };
  session.setDefaults(olderChoice);
  await vi.waitFor(() => expect(persistenceMocks.savePreferences).toHaveBeenCalledOnce());
  session.setDefaults(newerChoice);
  await vi.waitFor(() => expect(persistenceMocks.savePreferences).toHaveBeenCalledTimes(2));

  resolveOlderSave?.('applied');
  await Promise.resolve();
  const storageListener = persistenceMocks.subscribePreferences.mock.calls.at(-1)?.[1];
  storageListener?.(olderChoice);
  expect(session.getSnapshot().defaults).toEqual(newerChoice);

  resolveNewerSave?.('applied');
  stop();
});
