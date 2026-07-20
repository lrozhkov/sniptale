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
  const { muxer, target } = buildMp4Muxer(profiles, settings);

  return {
    ...profiles,
    muxer,
    target,
  };
}
