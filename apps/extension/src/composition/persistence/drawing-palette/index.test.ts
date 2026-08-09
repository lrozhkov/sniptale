import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browserStorage } from '../infrastructure/browser-storage';
import {
  DRAWING_PALETTE_STORAGE_KEY,
  changeDrawingPaletteColor,
  createDefaultDrawingPaletteState,
  getDrawingPaletteSnapshot,
  loadDrawingPaletteState,
  reorderDrawingPaletteColor,
  subscribeToDrawingPaletteState,
} from './index';

describe('drawing palette persistence', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(browserStorage.local, 'get').mockResolvedValue({});
  });

  it('uses defaults without repairing missing storage on read', async () => {
    vi.spyOn(browserStorage.local, 'get').mockResolvedValue({});
    const write = vi.spyOn(browserStorage.local, 'set');
    expect(await loadDrawingPaletteState()).toEqual(createDefaultDrawingPaletteState());
    expect(write).not.toHaveBeenCalled();
  });

  it('rejects malformed palettes before writing', async () => {
    const write = vi.spyOn(browserStorage.local, 'set');
    expect(await changeDrawingPaletteColor(0, 'not-a-color')).toBe('rejected');
    expect(write).not.toHaveBeenCalled();
  });

  it('writes a valid opaque ten-color palette through the local owner', async () => {
    const write = vi.spyOn(browserStorage.local, 'set').mockResolvedValue(undefined);
    const colors = createDefaultDrawingPaletteState().colors;
    expect(await changeDrawingPaletteColor(0, colors[0]!)).toBe('applied');
    expect(write).toHaveBeenCalledWith(
      { [DRAWING_PALETTE_STORAGE_KEY]: { schemaVersion: 1, colors } },
      expect.any(Object)
    );
  });

  it('serves cloned snapshots and observes only the drawing key in local storage', async () => {
    const colors = createDefaultDrawingPaletteState().colors.map((color) => color.toUpperCase());
    vi.spyOn(browserStorage.local, 'get').mockResolvedValue({
      [DRAWING_PALETTE_STORAGE_KEY]: { schemaVersion: 1, colors },
    });
    await loadDrawingPaletteState();
    expect(getDrawingPaletteSnapshot().colors).toEqual(colors.map((color) => color.toLowerCase()));

    const unsubscribe = vi.fn();
    vi.spyOn(browserStorage, 'canObserveChanges').mockReturnValue(true);
    const subscribe = vi.spyOn(browserStorage, 'subscribeToChanges').mockReturnValue(unsubscribe);
    const listener = vi.fn();
    const stop = subscribeToDrawingPaletteState(listener);
    const changeListener = subscribe.mock.calls[0]?.[0];
    expect(changeListener).toBeTypeOf('function');
    changeListener?.({ unrelated: { newValue: true } }, 'local');
    changeListener?.(
      { [DRAWING_PALETTE_STORAGE_KEY]: { newValue: { schemaVersion: 1, colors } } },
      'sync'
    );
    changeListener?.(
      { [DRAWING_PALETTE_STORAGE_KEY]: { newValue: { schemaVersion: 1, colors } } },
      'local'
    );
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('uses a no-op subscription when change observation is unavailable', () => {
    vi.spyOn(browserStorage, 'canObserveChanges').mockReturnValue(false);
    expect(subscribeToDrawingPaletteState(vi.fn())).toBeTypeOf('function');
  });

  it('rejects unsafe current storage and recovers the mutation queue after a write failure', async () => {
    const colors = createDefaultDrawingPaletteState().colors;
    vi.spyOn(browserStorage.local, 'get')
      .mockResolvedValueOnce({ [DRAWING_PALETTE_STORAGE_KEY]: { schemaVersion: 99, colors } })
      .mockResolvedValue({});
    const write = vi
      .spyOn(browserStorage.local, 'set')
      .mockRejectedValueOnce(new Error('storage failed'))
      .mockResolvedValue(undefined);
    expect(await changeDrawingPaletteColor(0, colors[0]!)).toBe('rejected');
    await expect(changeDrawingPaletteColor(0, colors[0]!)).rejects.toThrow('storage failed');
    expect(await changeDrawingPaletteColor(0, colors[0]!)).toBe('applied');
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('applies queued color intents to the latest authoritative palette', async () => {
    let stored = createDefaultDrawingPaletteState();
    vi.spyOn(browserStorage.local, 'get').mockImplementation(async () => ({
      [DRAWING_PALETTE_STORAGE_KEY]: stored,
    }));
    vi.spyOn(browserStorage.local, 'set').mockImplementation(async (value) => {
      stored = value[DRAWING_PALETTE_STORAGE_KEY] as typeof stored;
    });
    const first = changeDrawingPaletteColor(0, '#010101');
    const second = changeDrawingPaletteColor(1, '#020202');
    expect(await Promise.all([first, second])).toEqual(['applied', 'applied']);
    expect(stored.colors.slice(0, 2)).toEqual(['#010101', '#020202']);

    expect(await reorderDrawingPaletteColor(0, 2)).toBe('applied');
    expect(stored.colors.slice(0, 2)).toEqual(['#020202', '#010101']);
    expect(await changeDrawingPaletteColor(99, '#030303')).toBe('rejected');
    expect(await reorderDrawingPaletteColor(0, 99)).toBe('rejected');
  });
});
