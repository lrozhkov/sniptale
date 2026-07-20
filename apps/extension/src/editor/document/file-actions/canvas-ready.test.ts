// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureEditorCanvasReadyHandoff } from '../canvas-ready/handoff';
import { waitForEditorDocumentCanvas } from './canvas-ready';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('waitForEditorDocumentCanvas', () => {
  it('resolves immediately when the canvas is already mounted', async () => {
    await expect(
      waitForEditorDocumentCanvas({
        canvas: document.createElement('canvas'),
      })
    ).resolves.toBeUndefined();
  });

  it('waits for the shared controller lifecycle handoff', async () => {
    const editor = { canvas: null as HTMLCanvasElement | null };

    const pending = waitForEditorDocumentCanvas(editor);
    editor.canvas = document.createElement('canvas');
    const handoff = ensureEditorCanvasReadyHandoff(editor);
    handoff.markReady(handoff.beginMount());

    await expect(pending).resolves.toBeUndefined();
  });

  it('rejects when the document canvas never appears before the timeout', async () => {
    const pending = waitForEditorDocumentCanvas({ canvas: null }, 100);
    const rejection = expect(pending).rejects.toThrow(
      'Timed out waiting for the editor canvas after 100ms'
    );
    await vi.advanceTimersByTimeAsync(100);

    await rejection;
  });
});
