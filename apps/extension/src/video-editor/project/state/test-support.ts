import { createVideoProjectAsset } from '../../../features/video/project/factories/creation';
import { VideoProjectAssetType } from '../../../features/video/project/types/index';

export function createVideoAsset(name: string, hasAudio = true) {
  return createVideoProjectAsset(
    name,
    VideoProjectAssetType.VIDEO,
    {
      kind: 'project-asset',
      projectAssetId: `${name}-asset`,
    },
    {
      width: 1920,
      height: 1080,
      duration: 6,
      mimeType: 'video/mp4',
      size: 100,
      hasAudio,
      audioPeaks: hasAudio ? [0.1, 0.2, 0.4, 0.2] : null,
    }
  );
}
