import type { getSupportedMp4AudioEncoder, getSupportedMp4VideoEncoder } from '../codecs';

export function collectMp4FallbackNotes(
  _videoProfile: Awaited<ReturnType<typeof getSupportedMp4VideoEncoder>>,
  audioProfile: Awaited<ReturnType<typeof getSupportedMp4AudioEncoder>> | null
) {
  const fallbackNotes: string[] = [];
  if (audioProfile && audioProfile.muxerCodec !== 'aac') {
    fallbackNotes.push(audioProfile.label);
  }
  return fallbackNotes;
}

export function warnAboutMp4FallbackNotes(args: {
  audioProfile: Awaited<ReturnType<typeof getSupportedMp4AudioEncoder>> | null;
  fallbackNotes: string[];
  logger: { warn: (message: string, detail: string) => void };
  videoProfile: Awaited<ReturnType<typeof getSupportedMp4VideoEncoder>>;
}) {
  const { audioProfile, fallbackNotes, logger } = args;

  if (audioProfile && audioProfile.muxerCodec !== 'aac') {
    logger.warn('AAC encoder unavailable, falling back to', audioProfile.label);
  }

  return fallbackNotes;
}
