import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  bootstrapOffscreenDocumentMock,
  getCurrentLocaleMock,
  registerOffscreenRuntimeMessageListenerMock,
  registerOffscreenVoiceInputMessageListenerMock,
  translateMock,
} = vi.hoisted(() => ({
  bootstrapOffscreenDocumentMock: vi.fn(),
  getCurrentLocaleMock: vi.fn(() => 'en'),
  registerOffscreenRuntimeMessageListenerMock: vi.fn(),
  registerOffscreenVoiceInputMessageListenerMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('./bootstrap', () => ({
  bootstrapOffscreenDocument: bootstrapOffscreenDocumentMock,
}));

vi.mock('./index', () => ({
  registerOffscreenRuntimeMessageListener: registerOffscreenRuntimeMessageListenerMock,
}));

vi.mock('../voice-input/runtime', () => ({
  registerOffscreenVoiceInputMessageListener: registerOffscreenVoiceInputMessageListenerMock,
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  getCurrentLocale: getCurrentLocaleMock,
  translate: translateMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('offscreen entrypoint', () => {
  it('owns document metadata and delegates runtime startup', async () => {
    const statusText = { textContent: '' };
    vi.stubGlobal('document', {
      documentElement: { lang: 'ru' },
      getElementById: vi.fn(() => statusText),
      title: 'initial',
    });

    await import('../offscreen');

    expect(getCurrentLocaleMock).toHaveBeenCalledOnce();
    expect(translateMock).toHaveBeenCalledWith('background.runtime.offscreenDocumentTitle', 'en');
    expect(translateMock).toHaveBeenCalledWith('popup.labels.statusReady', 'en');
    expect((document as { documentElement: { lang: string } }).documentElement.lang).toBe('en');
    expect((document as { title: string }).title).toBe('background.runtime.offscreenDocumentTitle');
    expect(statusText.textContent).toBe('popup.labels.statusReady');
    expect(bootstrapOffscreenDocumentMock).toHaveBeenCalledOnce();
    expect(registerOffscreenRuntimeMessageListenerMock).toHaveBeenCalledOnce();
    expect(registerOffscreenVoiceInputMessageListenerMock).toHaveBeenCalledOnce();
  });

  it('updates document metadata when the optional status node is missing', async () => {
    vi.stubGlobal('document', {
      documentElement: { lang: 'ru' },
      getElementById: vi.fn(() => null),
      title: 'initial',
    });

    await import('../offscreen');

    expect((document as { documentElement: { lang: string } }).documentElement.lang).toBe('en');
    expect((document as { title: string }).title).toBe('background.runtime.offscreenDocumentTitle');
  });

  it('still delegates runtime startup without document globals', async () => {
    await import('../offscreen');

    expect(getCurrentLocaleMock).not.toHaveBeenCalled();
    expect(bootstrapOffscreenDocumentMock).toHaveBeenCalledOnce();
    expect(registerOffscreenRuntimeMessageListenerMock).toHaveBeenCalledOnce();
    expect(registerOffscreenVoiceInputMessageListenerMock).toHaveBeenCalledOnce();
  });
});
