import { afterEach, expect, it, vi } from 'vitest';
import { createEffectAudioBufferCache } from '../../../../../../features/video/composition/effect-runtime';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

it('returns null without creating contexts when the project has no renderable audio clips', async () => {
  const collectRenderableAudioClipsMock = vi.fn(() => []);
  const createOfflineAudioMixContextMock = vi.fn();
  const renderOfflineAudioMixLoopMock = vi.fn();

  vi.doMock('../../../clip-audio/index', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../clip-audio/index')>()),
    collectRenderableAudioClips: collectRenderableAudioClipsMock,
  }));
  vi.doMock('./context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./context')>()),
    createOfflineAudioMixContext: createOfflineAudioMixContextMock,
  }));
  vi.doMock('./render-loop', () => ({
    renderOfflineAudioMixLoop: renderOfflineAudioMixLoopMock,
  }));

  const { renderOfflineAudioMix } = await import('./index');

  await expect(renderOfflineAudioMix({ duration: 2 } as never)).resolves.toBeNull();
  expect(collectRenderableAudioClipsMock).toHaveBeenCalledWith({ duration: 2 }, undefined);
  expect(createOfflineAudioMixContextMock).not.toHaveBeenCalled();
  expect(renderOfflineAudioMixLoopMock).not.toHaveBeenCalled();
});

it('creates mix contexts and forwards the abort signal into the render loop', async () => {
  const clips = [{ id: 'clip-1' }];
  const contextBundle = {
    decodeContext: { id: 'decode' },
    decodedBuffers: createEffectAudioBufferCache<AudioBuffer>(),
    offlineContext: { id: 'offline' },
  };
  const renderResult = {
    buffer: { id: 'buffer' } as unknown as AudioBuffer,
    settings: { numberOfChannels: 2, sampleRate: 48_000 },
  };
  const controller = new AbortController();
  const collectRenderableAudioClipsMock = vi.fn(() => clips);
  const createOfflineAudioMixContextMock = vi.fn(() => contextBundle);
  const renderOfflineAudioMixLoopMock = vi.fn().mockResolvedValue(renderResult);

  vi.doMock('../../../clip-audio/index', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../clip-audio/index')>()),
    collectRenderableAudioClips: collectRenderableAudioClipsMock,
  }));
  vi.doMock('./context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./context')>()),
    createOfflineAudioMixContext: createOfflineAudioMixContextMock,
  }));
  vi.doMock('./render-loop', () => ({
    renderOfflineAudioMixLoop: renderOfflineAudioMixLoopMock,
  }));

  const { renderOfflineAudioMix } = await import('./index');
  const project = { duration: 4, tracks: [] };

  await expect(renderOfflineAudioMix(project as never, controller.signal)).resolves.toEqual(
    renderResult
  );
  expect(createOfflineAudioMixContextMock).toHaveBeenCalledWith(4);
  expect(renderOfflineAudioMixLoopMock).toHaveBeenCalledWith({
    clipsWithAudio: clips,
    decodeContext: contextBundle.decodeContext,
    decodedBuffers: contextBundle.decodedBuffers,
    offlineContext: contextBundle.offlineContext,
    project,
    signal: controller.signal,
  });
});

it('uses the selected export range duration when settings are provided', async () => {
  const clips = [{ id: 'clip-1' }];
  const contextBundle = {
    decodeContext: { id: 'decode' },
    decodedBuffers: createEffectAudioBufferCache<AudioBuffer>(),
    offlineContext: { id: 'offline' },
  };
  const renderResult = {
    buffer: { id: 'buffer' } as unknown as AudioBuffer,
    settings: { numberOfChannels: 2, sampleRate: 48_000 },
  };
  const collectRenderableAudioClipsMock = vi.fn(() => clips);
  const createOfflineAudioMixContextMock = vi.fn(() => contextBundle);
  const renderOfflineAudioMixLoopMock = vi.fn().mockResolvedValue(renderResult);
  const settings = { rangeEndSeconds: 4, rangeStartSeconds: 1 };

  vi.doMock('../../../clip-audio/index', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../clip-audio/index')>()),
    collectRenderableAudioClips: collectRenderableAudioClipsMock,
  }));
  vi.doMock('./context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./context')>()),
    createOfflineAudioMixContext: createOfflineAudioMixContextMock,
  }));
  vi.doMock('./render-loop', () => ({
    renderOfflineAudioMixLoop: renderOfflineAudioMixLoopMock,
  }));

  const { renderOfflineAudioMix } = await import('./index');
  const project = { duration: 10, tracks: [] };

  await expect(renderOfflineAudioMix(project as never, settings as never)).resolves.toEqual(
    renderResult
  );
  expect(collectRenderableAudioClipsMock).toHaveBeenCalledWith(project, settings);
  expect(createOfflineAudioMixContextMock).toHaveBeenCalledWith(3);
});
