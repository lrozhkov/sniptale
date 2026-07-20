import { getAssetById } from '../../../features/video/project/timeline';
import { getProjectSceneBackgroundImageAssetId } from '../../../features/video/project/scene/background';
import type { VideoProject } from '../../../features/video/project/types';
import { VideoProjectClipType } from '../../../features/video/project/types';
import { loadBlobForAsset } from './blob';
import { waitForImageReady } from './ready';
import type { ProjectExportUrlState } from './types';

function releaseImageObjectUrl(job: ProjectExportUrlState, url: string): void {
  job.assetUrls = job.assetUrls.filter((assetUrl) => assetUrl !== url);
  URL.revokeObjectURL(url);
}

export async function loadImagesForProject(
  project: VideoProject,
  job: ProjectExportUrlState,
  signal?: AbortSignal
): Promise<Record<string, HTMLImageElement>> {
  const result: Record<string, HTMLImageElement> = {};
  const pendingImages = new Map<string, Promise<void>>();
  const imageAssetIds = collectProjectImageAssetIds(project);

  await Promise.all(
    [...imageAssetIds].map(async (assetId) => {
      const existingLoad = pendingImages.get(assetId);
      if (existingLoad) {
        await existingLoad;
        return;
      }

      const loadPromise = (async () => {
        const asset = getAssetById(project, assetId);
        if (!asset) {
          throw new Error(`Image asset ${assetId} not found.`);
        }

        const blob = await loadBlobForAsset(asset);
        const url = URL.createObjectURL(blob);
        job.assetUrls.push(url);

        const image = new Image();
        image.decoding = 'async';
        image.src = url;
        try {
          await waitForImageReady(image, signal ? { signal } : undefined);
          result[assetId] = image;
        } catch (error) {
          releaseImageObjectUrl(job, url);
          throw error;
        }
      })();

      pendingImages.set(assetId, loadPromise);
      await loadPromise;
    })
  );

  return result;
}

function collectProjectImageAssetIds(project: VideoProject): Set<string> {
  const imageAssetIds = new Set(
    project.clips
      .filter((clip) => clip.type === VideoProjectClipType.IMAGE)
      .map((clip) => clip.assetId)
  );

  project.clips.forEach((clip) => {
    if (clip.type === VideoProjectClipType.SHAPE && clip.embeddedAsset) {
      imageAssetIds.add(clip.embeddedAsset.assetId);
    }
  });

  const backgroundImageAssetId = getProjectSceneBackgroundImageAssetId(project);
  if (backgroundImageAssetId) {
    imageAssetIds.add(backgroundImageAssetId);
  }

  return imageAssetIds;
}
