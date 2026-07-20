import { beforeEach, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  create: vi.fn(),
  dispose: vi.fn(),
  getSnapshot: vi.fn(),
  install: vi.fn(),
}));

vi.mock('./controller', async (importOriginal) => ({
  ...(await importOriginal()),
  createConsoleDiagnosticsCaptureController: controllerMocks.create,
}));

import {
  getConsoleDiagnosticsSnapshot,
  startConsoleDiagnosticsCapture,
  stopConsoleDiagnosticsCapture,
} from '.';

beforeEach(() => {
  vi.clearAllMocks();
  controllerMocks.create.mockReturnValue({
    dispose: controllerMocks.dispose,
    getSnapshot: controllerMocks.getSnapshot,
    install: controllerMocks.install,
  });
});

it('keeps the default controller lazy and reuses it for a diagnostics session', () => {
  expect(getConsoleDiagnosticsSnapshot()).toEqual({
    capturedAt: '',
    droppedCount: 0,
    entries: [],
  });
  stopConsoleDiagnosticsCapture();
  expect(controllerMocks.create).not.toHaveBeenCalled();

  startConsoleDiagnosticsCapture();
  startConsoleDiagnosticsCapture();
  expect(controllerMocks.create).toHaveBeenCalledOnce();
  expect(controllerMocks.install).toHaveBeenCalledTimes(2);

  const snapshot = { capturedAt: '2026-07-15T00:00:00.000Z', droppedCount: 1, entries: [] };
  controllerMocks.getSnapshot.mockReturnValue(snapshot);
  expect(getConsoleDiagnosticsSnapshot()).toBe(snapshot);

  stopConsoleDiagnosticsCapture();
  expect(controllerMocks.dispose).toHaveBeenCalledOnce();
});
