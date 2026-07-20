import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { type VideoProjectExportSettings } from '../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../features/video/project/types/model';
import {
  ensureMp4ExportSupport,
  getSupportedMp4AudioEncoder,
  getSupportedMp4VideoEncoder,
} from '../../codecs';
import { renderOfflineAudioMix } from '../../offline-audio';
import { collectMp4FallbackNotes, warnAboutMp4FallbackNotes } from '../fallback-notes';
import type { Mp4PipelineProfiles } from './types';

const logger = createLogger({ namespace: 'OffscreenProjectExport' });

export async function buildMp4PipelineProfiles(args: {
  project: VideoProject;
  settings: VideoProjectExportSettings;
  signal?: AbortSignal;
}): Promise<Mp4PipelineProfiles> {
  const mixedAudio = await renderOfflineAudioMix(args.project, args.settings, args.signal);
  ensureMp4ExportSupport(Boolean(mixedAudio));
  if (!args.settings.mp4VideoCodec) {
    throw new Error(translate('offscreenExport.mp4VideoCodecRequired'));
  }

  const videoProfile = await getSupportedMp4VideoEncoder(
    args.settings,
    args.settings.mp4VideoCodec
  );
  const audioProfile = mixedAudio ? await getSupportedMp4AudioEncoder(mixedAudio.settings) : null;
  const fallbackNotes = warnAboutMp4FallbackNotes({
    audioProfile,
    fallbackNotes: collectMp4FallbackNotes(videoProfile, audioProfile),
    logger,
    videoProfile,
  });

  return {
    audioProfile,
    fallbackNotes,
    mixedAudio,
    videoProfile,
  };
}
