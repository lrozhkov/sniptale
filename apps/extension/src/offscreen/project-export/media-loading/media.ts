import { getAssetById, isAudioClip, isVideoClip } from '../../../features/video/project/timeline';
import type {
  VideoProject,
  VideoProjectAudioClip,
  VideoProjectVideoClip,
} from '../../../features/video/project/types';
import { loadBlobForAsset } from './blob';
import { waitForMediaElementReady } from './ready';
import type { ProjectExportUrlState } from './types';

async function forEachWithConcurrency<TItem>(
  items: TItem[],
  limit: number,
  run: (item: TItem) => Promise<void>
) {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await run(items[currentIndex]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
}

function releaseClipMediaPreload(args: {
  clipId: string;
  element: HTMLMediaElement;
  job: ProjectExportUrlState & { clipMediaElements: Map<string, HTMLMediaElement> };
  url: string;
}): void {
  args.job.clipMediaElements.delete(args.clipId);
  args.job.assetUrls = args.job.assetUrls.filter((assetUrl) => assetUrl !== args.url);
  args.element.remove();
  URL.revokeObjectURL(args.url);
}

export async function preloadClipVideos(
  project: VideoProject,
  job: ProjectExportUrlState & { clipMediaElements: Map<string, HTMLMediaElement> },
  container: HTMLElement,
  signal?: AbortSignal
): Promise<void> {
  const mediaClips = project.clips.filter(
    (clip): clip is VideoProjectVideoClip | VideoProjectAudioClip =>
      isVideoClip(clip) || isAudioClip(clip)
  );
  await forEachWithConcurrency(mediaClips, 3, async (clip) => {
    const asset = getAssetById(project, clip.assetId);
    if (!asset) {
      throw new Error(`Asset ${clip.assetId} not found for clip ${clip.id}`);
    }

    const blob = await loadBlobForAsset(asset);
    const url = URL.createObjectURL(blob);
    job.assetUrls.push(url);

    const element: HTMLMediaElement = isAudioClip(clip)
      ? document.createElement('audio')
      : document.createElement('video');
    element.src = url;
    element.preload = 'auto';
    element.muted = true;
    element.crossOrigin = 'anonymous';
    element.style.width = '1px';
    element.style.height = '1px';
    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
    }
    container.appendChild(element);

    element.load();
    try {
      await waitForMediaElementReady(element, signal ? { signal } : undefined);
      job.clipMediaElements.set(clip.id, element);
    } catch (error) {
      releaseClipMediaPreload({ clipId: clip.id, element, job, url });
      throw error;
    }
  });
}
