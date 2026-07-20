import { afterEach, expect, it, vi } from 'vitest';
import { createEffectAudioBufferCache } from '../../../../../../../features/video/composition/effect-runtime';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function installLoopRunMocks(overrides?: { executeImpl?: () => Promise<unknown> }) {
  const closeOfflineAudioMixContextMock = vi.fn().mockResolvedValue(undefined);
  const decodeClipAudioBufferMock = vi.fn();
  const executeOfflineAudioMixRenderMock = vi.fn().mockImplementation(
    overrides?.executeImpl ??
      (() =>
        Promise.resolve({
          buffer: { id: 'buffer' },
          settings: { numberOfChannels: 2, sampleRate: 48_000 },
        }))
  );
  const scheduleOfflineAudioClipMixMock = vi.fn();
  const throwIfOfflineAudioMixAbortedMock = vi.fn();
  const buildOfflineAudioMixResultMock = vi.fn();

  vi.doMock('../context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../context')>()),
    closeOfflineAudioMixContext: closeOfflineAudioMixContextMock,
  }));
  vi.doMock('../../result', () => ({
    buildOfflineAudioMixResult: buildOfflineAudioMixResultMock,
  }));
  vi.doMock('../../../schedule', () => ({
    scheduleOfflineAudioClipMix: scheduleOfflineAudioClipMixMock,
  }));
  vi.doMock('../../../../clip-audio/index', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../../clip-audio/index')>()),
    decodeClipAudioBuffer: decodeClipAudioBufferMock,
  }));
  vi.doMock('./abort', () => ({
    throwIfOfflineAudioMixAborted: throwIfOfflineAudioMixAbortedMock,
  }));
  vi.doMock('./execute', () => ({
    executeOfflineAudioMixRender: executeOfflineAudioMixRenderMock,
  }));

  return {
    buildOfflineAudioMixResultMock,
    closeOfflineAudioMixContextMock,
    decodeClipAudioBufferMock,
    executeOfflineAudioMixRenderMock,
    scheduleOfflineAudioClipMixMock,
    throwIfOfflineAudioMixAbortedMock,
  };
}

async function verifiesLoopExecutorWiringAndContextCleanup() {
  const {
    buildOfflineAudioMixResultMock,
    closeOfflineAudioMixContextMock,
    decodeClipAudioBufferMock,
    executeOfflineAudioMixRenderMock,
    scheduleOfflineAudioClipMixMock,
    throwIfOfflineAudioMixAbortedMock,
  } = installLoopRunMocks();

  const { renderOfflineAudioMixLoop } = await import('./run');
  const controller = new AbortController();
  const decodeContext = { id: 'decode' };
  const decodedBuffers = createEffectAudioBufferCache<AudioBuffer>();
  const offlineContext = { id: 'offline' };
  const clipsWithAudio = [{ id: 'clip-1' }];
  const project = { duration: 3 };

  await expect(
    renderOfflineAudioMixLoop({
      clipsWithAudio: clipsWithAudio as never,
      decodeContext: decodeContext as never,
      decodedBuffers,
      offlineContext: offlineContext as never,
      project: project as never,
      signal: controller.signal,
    })
  ).resolves.toEqual({
    buffer: { id: 'buffer' },
    settings: { numberOfChannels: 2, sampleRate: 48_000 },
  });

  expect(executeOfflineAudioMixRenderMock).toHaveBeenCalledWith({
    clipsWithAudio,
    decodeContext,
    decodedBuffers,
    offlineContext,
    buildOfflineAudioMixResult: buildOfflineAudioMixResultMock,
    decodeClipAudioBuffer: decodeClipAudioBufferMock,
    project,
    scheduleOfflineAudioClipMix: scheduleOfflineAudioClipMixMock,
    throwIfAborted: throwIfOfflineAudioMixAbortedMock,
    signal: controller.signal,
  });
  expect(closeOfflineAudioMixContextMock).toHaveBeenCalledWith(decodeContext);
}

it(
  'passes canonical collaborators into the loop executor and closes the decode context',
  verifiesLoopExecutorWiringAndContextCleanup
);

it('still closes the decode context when the executor rejects', async () => {
  const { closeOfflineAudioMixContextMock } = installLoopRunMocks({
    executeImpl: () => Promise.reject(new Error('render failed')),
  });

  const { renderOfflineAudioMixLoop } = await import('./run');
  const decodeContext = { id: 'decode' };

  await expect(
    renderOfflineAudioMixLoop({
      clipsWithAudio: [] as never,
      decodeContext: decodeContext as never,
      decodedBuffers: createEffectAudioBufferCache<AudioBuffer>(),
      offlineContext: { id: 'offline' } as never,
      project: { duration: 1 } as never,
    })
  ).rejects.toThrow('render failed');

  expect(closeOfflineAudioMixContextMock).toHaveBeenCalledWith(decodeContext);
});
