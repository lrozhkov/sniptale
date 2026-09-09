import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getProjectSceneBackgroundImageAssetId } from '../../../../features/video/project/scene/background';
import { isVideoClip } from '../../../../features/video/project/timeline';
import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../features/video/project/types/index';
import type { PreviewStageVideoRefs } from '../types';

interface PreviewStageVideoBankProps {
  assetUrls: Record<string, string>;
  bankClips: VideoProjectClip[];
  videoRefs: PreviewStageVideoRefs;
}

function getImageAssetPlanKey(
  project: VideoProject,
  activeClips: VideoProjectClip[],
  assetUrls: Record<string, string>
): string {
  return [...resolveActiveImageAssetIds(project, activeClips)]
    .map((assetId) => `${assetId}:${assetUrls[assetId] ?? ''}`)
    .join('|');
}

function resolveActiveImageAssetIds(
  project: VideoProject,
  activeClips: VideoProjectClip[]
): Set<string> {
  const activeImageAssetIds = new Set(
    activeClips.filter((clip) => clip.type === 'IMAGE').map((clip) => clip.assetId)
  );
  activeClips.forEach((clip) => {
    if (clip.type === 'SHAPE' && clip.embeddedAsset) {
      activeImageAssetIds.add(clip.embeddedAsset.assetId);
    }
  });
  const backgroundAssetId = getProjectSceneBackgroundImageAssetId(project);
  if (backgroundAssetId) {
    activeImageAssetIds.add(backgroundAssetId);
  }

  return activeImageAssetIds;
}

function pruneInactiveImages(
  cacheRef: React.MutableRefObject<Record<string, HTMLImageElement>>,
  activeImageAssetIds: Set<string>
) {
  Object.keys(cacheRef.current).forEach((assetId) => {
    if (!activeImageAssetIds.has(assetId)) {
      delete cacheRef.current[assetId];
    }
  });
}

export function PreviewStageVideoBank({
  assetUrls,
  bankClips,
  videoRefs,
}: PreviewStageVideoBankProps): React.JSX.Element {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-hidden opacity-0"
    >
      {bankClips.filter(isVideoClip).map((clip) => {
        const src = assetUrls[clip.assetId];
        if (!src) {
          return null;
        }

        return <PreviewBankVideo key={clip.id} clipId={clip.id} src={src} videoRefs={videoRefs} />;
      })}
    </div>
  );
}

function PreviewBankVideo({
  clipId,
  src,
  videoRefs,
}: {
  clipId: string;
  src: string;
  videoRefs: PreviewStageVideoRefs;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useLayoutEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.defaultMuted = true;
    video.muted = true;
    video.src = src;
    const videos = videoRefs.current;
    videos[clipId] = video;
    return () => {
      if (videos[clipId] === video) delete videos[clipId];
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [clipId, src, videoRefs]);
  return <video ref={ref} playsInline preload="auto" />;
}

export function usePreviewStageImageBank(
  project: VideoProject,
  activeClips: VideoProjectClip[],
  assetUrls: Record<string, string>
): Record<string, HTMLImageElement> {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const cacheRef = useRef<Record<string, HTMLImageElement>>({});
  const imagePlanKey = useMemo(
    () => getImageAssetPlanKey(project, activeClips, assetUrls),
    [project, activeClips, assetUrls]
  );

  useEffect(() => {
    const activeImageAssetIds = resolveActiveImageAssetIds(project, activeClips);
    pruneInactiveImages(cacheRef, activeImageAssetIds);
    setImages({ ...cacheRef.current });

    let cancelled = false;
    activeImageAssetIds.forEach((assetId) => {
      const src = assetUrls[assetId];
      if (!src || cacheRef.current[assetId]?.src === src) {
        return;
      }

      const image = new Image();
      image.onload = () => {
        if (cancelled) {
          return;
        }

        cacheRef.current[assetId] = image;
        setImages({ ...cacheRef.current });
      };
      image.src = src;
    });

    return () => {
      cancelled = true;
    };
  }, [project, activeClips, assetUrls, imagePlanKey]);

  return images;
}
