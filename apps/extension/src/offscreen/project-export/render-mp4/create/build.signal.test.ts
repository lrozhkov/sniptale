import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function installCreateMp4PipelineMocks() {
  const buildMp4MuxerMock = vi.fn().mockReturnValue({
    muxer: { id: 'muxer' },
    target: { id: 'target' },
  });
  const buildMp4PipelineProfilesMock = vi.fn().mockResolvedValue({
    audioProfile: null,
    fallbackNotes: [],
    mixedAudio: null,
    videoProfile: { muxerCodec: 'avc' },
  });

  vi.doMock('./muxer', () => ({
    buildMp4Muxer: buildMp4MuxerMock,
  }));
  vi.doMock('./profiles', () => ({
    buildMp4PipelineProfiles: buildMp4PipelineProfilesMock,
  }));

  return { buildMp4MuxerMock, buildMp4PipelineProfilesMock };
}

it('forwards the abort signal into profile construction and returns the muxer bundle', async () => {
  const { buildMp4MuxerMock, buildMp4PipelineProfilesMock } = installCreateMp4PipelineMocks();
  const signal = new AbortController().signal;
  const { createMp4Pipeline } = await import('./build');
  const project = { duration: 2 };
  const settings = { fps: 30, format: 'MP4', height: 720, width: 1280 };

  await expect(createMp4Pipeline(project as never, settings as never, signal)).resolves.toEqual({
    audioProfile: null,
    fallbackNotes: [],
    mixedAudio: null,
    muxer: { id: 'muxer' },
    target: { id: 'target' },
    videoProfile: { muxerCodec: 'avc' },
  });
  expect(buildMp4PipelineProfilesMock).toHaveBeenCalledWith({
    project,
    settings,
    signal,
  });
  expect(buildMp4MuxerMock).toHaveBeenCalledWith(
    {
      audioProfile: null,
      fallbackNotes: [],
      mixedAudio: null,
      videoProfile: { muxerCodec: 'avc' },
    },
    settings
  );
});

it('omits the signal field when pipeline creation has no abort signal', async () => {
  const { buildMp4PipelineProfilesMock } = installCreateMp4PipelineMocks();
  const { createMp4Pipeline } = await import('./build');
  const project = { duration: 2 };
  const settings = { fps: 30, format: 'MP4', height: 720, width: 1280 };

  await createMp4Pipeline(project as never, settings as never);

  expect(buildMp4PipelineProfilesMock).toHaveBeenCalledWith({
    project,
    settings,
  });
});
