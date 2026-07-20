import { translate } from '../../../platform/i18n';
import { normalizeError } from '../codecs';
import type { Mp4Pipeline } from './pipeline/index';

export function createMp4EncoderState(pipeline: Mp4Pipeline) {
  let pipelineError: Error | null = null;
  const rememberPipelineError = (error: unknown, fallbackMessage: string) => {
    if (!pipelineError) {
      pipelineError = normalizeError(error, fallbackMessage);
    }
  };
  const throwIfPipelineFailed = () => {
    if (pipelineError) {
      throw pipelineError;
    }
  };

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        pipeline.muxer.addVideoChunk(chunk, meta);
      } catch (error) {
        rememberPipelineError(error, translate('offscreenExport.mp4VideoChunkRejected'));
      }
    },
    error: (error) => {
      rememberPipelineError(error, translate('offscreenExport.mp4VideoEncoderFailed'));
    },
  });
  videoEncoder.configure(pipeline.videoProfile.config);

  const audioEncoder = pipeline.audioProfile
    ? createMp4AudioEncoder(pipeline, rememberPipelineError)
    : null;

  return { videoEncoder, audioEncoder, throwIfPipelineFailed };
}

function createMp4AudioEncoder(
  pipeline: Mp4Pipeline,
  rememberPipelineError: (error: unknown, fallbackMessage: string) => void
) {
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      try {
        pipeline.muxer.addAudioChunk(chunk, meta);
      } catch (error) {
        rememberPipelineError(error, translate('offscreenExport.mp4AudioChunkRejected'));
      }
    },
    error: (error) => {
      rememberPipelineError(error, translate('offscreenExport.mp4AudioEncoderFailed'));
    },
  });
  audioEncoder.configure(pipeline.audioProfile!.config);
  return audioEncoder;
}
