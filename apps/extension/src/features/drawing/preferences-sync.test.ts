import { expect, it, vi } from 'vitest';
import { createDefaultDrawingToolDefaults, type DrawingToolDefaults } from './model';
import { synchronizeDrawingToolPreferences } from './preferences-sync';

function createHarness(load: () => Promise<DrawingToolDefaults>) {
  let defaults = createDefaultDrawingToolDefaults();
  let localListener: () => void = () => undefined;
  let authoritativeListener: (next: DrawingToolDefaults) => void = () => undefined;
  const save = vi.fn(async (): Promise<'applied' | 'rejected'> => 'applied');
  const reportSaveFailure = vi.fn();
  const port = {
    getDefaults: () => defaults,
    load,
    reportSaveFailure,
    save,
    setDefaults: (next: DrawingToolDefaults) => {
      defaults = next;
      localListener();
    },
    subscribeAuthoritative: (
      _fallback: DrawingToolDefaults,
      listener: (next: DrawingToolDefaults) => void
    ) => {
      authoritativeListener = listener;
      return vi.fn();
    },
    subscribeDefaults: (listener: () => void) => {
      localListener = listener;
      return vi.fn();
    },
  };
  return {
    emitAuthoritative: (next: DrawingToolDefaults) => authoritativeListener(next),
    get defaults() {
      return defaults;
    },
    port,
    reportSaveFailure,
    save,
    setLocal(next: DrawingToolDefaults) {
      defaults = next;
      localListener();
    },
  };
}

it('rebases a pre-hydration edit and preserves a newer edit after an older acknowledgement', async () => {
  const authoritative = createDefaultDrawingToolDefaults();
  let resolveLoad: ((value: DrawingToolDefaults) => void) | undefined;
  const harness = createHarness(
    () =>
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
  );
  let resolveOlder: ((value: 'applied') => void) | undefined;
  let resolveNewer: ((value: 'applied') => void) | undefined;
  harness.save
    .mockReturnValueOnce(new Promise((resolve) => (resolveOlder = resolve)))
    .mockReturnValueOnce(new Promise((resolve) => (resolveNewer = resolve)));
  const stop = synchronizeDrawingToolPreferences(harness.port);

  const first = { ...authoritative, pencil: { ...authoritative.pencil, width: 8 } };
  harness.setLocal(first);
  resolveLoad?.(authoritative);
  await vi.waitFor(() => expect(harness.save).toHaveBeenCalledOnce());
  const second = { ...authoritative, pencil: { ...authoritative.pencil, width: 16 } };
  harness.setLocal(second);
  await vi.waitFor(() => expect(harness.save).toHaveBeenCalledTimes(2));

  resolveOlder?.('applied');
  await Promise.resolve();
  harness.emitAuthoritative(first);
  expect(harness.defaults.pencil.width).toBe(16);
  resolveNewer?.('applied');
  stop();
});

it('reports rejected and thrown saves once per unresolved failure episode', async () => {
  const defaults = createDefaultDrawingToolDefaults();
  const harness = createHarness(async () => defaults);
  harness.save.mockResolvedValueOnce('rejected').mockRejectedValueOnce(new Error('failed'));
  const stop = synchronizeDrawingToolPreferences(harness.port);
  await Promise.resolve();

  harness.setLocal({ ...defaults, marker: { ...defaults.marker, width: 44 } });
  await vi.waitFor(() => expect(harness.reportSaveFailure).toHaveBeenCalledOnce());
  harness.setLocal({ ...defaults, marker: { ...defaults.marker, width: 28 } });
  await Promise.resolve();
  expect(harness.reportSaveFailure).toHaveBeenCalledOnce();
  stop();
});
