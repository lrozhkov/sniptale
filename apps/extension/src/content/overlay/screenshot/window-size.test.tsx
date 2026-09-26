// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useScreenshotWindowSize } from './window-size';

const mutate = vi.hoisted(() => vi.fn());
vi.mock('../toolbar/shell/viewport-change', () => ({ handleToolbarViewportChange: mutate }));
let state: ReturnType<typeof useScreenshotWindowSize>;
let root: Root;
const preset = { presetId: 'hd', target: 'window' as const, width: 1280, height: 720 };
function Harness() {
  state = useScreenshotWindowSize();
  return null;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mutate.mockReset().mockResolvedValue(true);
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
it('keeps continuous capture unchanged and defers temporary selection until capture', async () => {
  await act(async () => state.controls.select(preset));
  expect(mutate.mock.calls[0]?.[0]).toEqual(preset);
  mutate.mockClear();
  await act(async () => {
    const release = await state.prepare();
    await release();
  });
  expect(mutate).not.toHaveBeenCalled();
  await act(async () => state.controls.setOnlyDuringCapture(true, preset));
  expect(mutate.mock.calls[0]?.[0]).toBeNull();
  mutate.mockClear();
  await act(async () => state.controls.select(preset));
  expect(mutate).not.toHaveBeenCalled();
  let release: (() => Promise<void>) | undefined;
  await act(async () => {
    release = await state.prepare();
  });
  expect(mutate.mock.calls[0]?.[0]).toEqual(preset);
  expect(state.controls.busy).toBe(true);
  await act(async () => {
    await release?.();
  });
  expect(mutate.mock.calls[1]?.[0]).toBeNull();
  expect(state.controls.selection).toEqual(preset);
  expect(state.controls.busy).toBe(false);
});
it('current size in temporary mode never mutates the window', async () => {
  await act(async () => state.controls.setOnlyDuringCapture(true, null));
  mutate.mockClear();
  await act(async () => {
    const release = await state.prepare();
    await release();
  });
  expect(mutate).not.toHaveBeenCalled();
});
it('keeps timing and selection unchanged after a failed mode transition', async () => {
  mutate.mockResolvedValueOnce(false);
  await act(async () => state.controls.setOnlyDuringCapture(true, preset));
  expect(state.controls.onlyDuringCapture).toBe(false);
  expect(state.controls.busy).toBe(false);
});
it('rejects overlapping captures and reports preparation and restoration failures', async () => {
  await act(async () => state.controls.setOnlyDuringCapture(true, preset));
  mutate.mockResolvedValueOnce(false);
  await act(async () => {
    await expect(state.prepare()).rejects.toThrow('preparation');
  });
  expect(state.controls.busy).toBe(false);
  let release: (() => Promise<void>) | undefined;
  await act(async () => {
    release = await state.prepare();
  });
  await expect(state.prepare()).rejects.toThrow('surface-busy');
  await act(async () => state.controls.select(null));
  expect(state.controls.selection).toEqual(preset);
  mutate.mockResolvedValueOnce(false);
  await act(async () => {
    await expect(release?.()).rejects.toThrow('restoration');
  });
  expect(state.controls.busy).toBe(false);
});
it('applies the saved temporary choice when continuous mode is selected', async () => {
  await act(async () => state.controls.setOnlyDuringCapture(true, null));
  await act(async () => state.controls.select(preset));
  mutate.mockClear();
  await act(async () => state.controls.setOnlyDuringCapture(false, null));
  expect(mutate.mock.calls[0]?.[0]).toEqual(preset);
  expect(state.controls.onlyDuringCapture).toBe(false);
});
