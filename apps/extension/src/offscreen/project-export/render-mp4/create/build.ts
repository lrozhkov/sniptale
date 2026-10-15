import { type VideoProjectExportSettings } from '../../../../features/video/project/types/export';
import { type VideoProject } from '../../../../features/video/project/types/model';
import { buildMp4Muxer } from './muxer';
import { buildMp4PipelineProfiles } from './profiles';
import type { Mp4Pipeline } from './types';

export async function createMp4Pipeline(
  project: VideoProject,
  settings: VideoProjectExportSettings,
  signal?: AbortSignal
): Promise<Mp4Pipeline> {
  const profiles = await buildMp4PipelineProfiles({
    project,
    settings,
    ...(signal === undefined ? {} : { signal }),
  });
  if (signal?.aborted) throw new Error('PROJECT_EXPORT_CANCELLED');
  const { muxer, target } = await buildMp4Muxer(profiles, settings);
  if (signal?.aborted) {
    await muxer.cancel();
    throw new Error('PROJECT_EXPORT_CANCELLED');
  }

  return {
    ...profiles,
    muxer,
    target,
  };
}
