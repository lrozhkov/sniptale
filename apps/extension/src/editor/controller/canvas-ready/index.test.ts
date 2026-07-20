// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureEditorCanvasReadyHandoff } from '../../document/canvas-ready/handoff';
import { waitForEditorControllerCanvas } from './';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForEditorControllerCanvas', () => {
  it('resolves immediately when the canvas is already mounted', async () => {
    await expect(
      waitForEditorControllerCanvas({
        canvas: document.createElement('canvas'),
      } as never)
    ).resolves.toBeUndefined();
  });

  it('waits for the controller lifecycle to publish ready', async () => {
    const controller = { canvas: null as HTMLCanvasElement | null };

    const pending = waitForEditorControllerCanvas(controller as never);
    controller.canvas = document.createElement('canvas');
    const handoff = ensureEditorCanvasReadyHandoff(controller);
    handoff.markReady(handoff.beginMount());

    await expect(pending).resolves.toBeUndefined();
  });

  it('rejects when the controller canvas never appears before the timeout', async () => {
    const pending = waitForEditorControllerCanvas({ canvas: null } as never, 100);
    const rejection = expect(pending).rejects.toThrow(
      'Timed out waiting for the editor canvas after 100ms'
    );
    await vi.advanceTimersByTimeAsync(100);

    await rejection;
  });
});
