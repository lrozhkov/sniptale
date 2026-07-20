import { describe, expect, it, vi } from 'vitest';

const { bootstrapOffscreenDocumentMock } = vi.hoisted(() => ({
  bootstrapOffscreenDocumentMock: vi.fn(),
}));

const { registerOffscreenRuntimeMessageListenerMock } = vi.hoisted(() => ({
  registerOffscreenRuntimeMessageListenerMock: vi.fn(),
}));

vi.mock('./bootstrap', () => ({
  bootstrapOffscreenDocument: bootstrapOffscreenDocumentMock,
}));

vi.mock('./index', () => ({
  registerOffscreenRuntimeMessageListener: registerOffscreenRuntimeMessageListenerMock,
}));

describe('offscreen entrypoint facade', () => {
  it('delegates bootstrap to the runtime owner', async () => {
    await import('../offscreen');

    expect(bootstrapOffscreenDocumentMock).toHaveBeenCalledOnce();
    expect(registerOffscreenRuntimeMessageListenerMock).toHaveBeenCalledOnce();
  });
});
