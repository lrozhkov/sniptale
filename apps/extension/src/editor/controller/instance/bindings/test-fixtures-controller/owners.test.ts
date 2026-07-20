import { describe, expect, it } from 'vitest';
import { createMockControllerCoreMethods } from './core-methods.test-support';
import { createMockControllerDocumentMethods } from './document-methods.test-support';
import { createMockControllerState } from './state';

describe('editor controller binding test fixture owners', () => {
  it('owns mock controller state defaults separately from command methods', () => {
    const state = createMockControllerState();

    expect(state.activeTool).toBe('select');
    expect(state.canvasDocumentSize).toEqual({ width: 10, height: 20 });
    expect(state.rasterToolSession.selection).toBeNull();
  });

  it('owns core command doubles separately from document command doubles', async () => {
    const core = createMockControllerCoreMethods();
    const document = createMockControllerDocumentMethods();

    expect(core.cancelTransientInteraction()).toBe(true);
    expect(core.withHistoryMuted(() => 'muted')).toBe('muted');
    expect(core.nextLabelIndex()).toBe(7);
    await document.openImage();
    await document.loadDocument();

    expect(document.exportDocument().sourceName).toBe('source.png');
    expect(document.openImage).toHaveBeenCalledOnce();
    expect(document.loadDocument).toHaveBeenCalledOnce();
  });
});
