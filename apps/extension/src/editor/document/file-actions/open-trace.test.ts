import { expect, it, vi } from 'vitest';

const debugMock = vi.fn();

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: vi.fn(() => ({ debug: debugMock })),
}));

it('logs document open trace events through the editor logger namespace', async () => {
  const { logEditorDocumentOpenTrace } = await import('./open-trace');

  logEditorDocumentOpenTrace('file:selected', { name: 'capture.png' });
  logEditorDocumentOpenTrace('canvas:ready');

  expect(debugMock).toHaveBeenNthCalledWith(1, 'open-image', {
    stage: 'file:selected',
    name: 'capture.png',
  });
  expect(debugMock).toHaveBeenNthCalledWith(2, 'open-image', {
    stage: 'canvas:ready',
  });
});
