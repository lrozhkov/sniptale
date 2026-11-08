import { collectPreviewImageResourceDemand } from '../scene/image-resources';
import type { PreviewImageResourceDemand } from '../scene/types';
import type { VideoCompositionFrame } from '../../../../features/video/composition/types';
import {
  projectWindowHeaderImages,
  windowHeaderImageKey,
} from '../../../../features/video/composition/draw/window-header';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useReducer } from 'react';
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

type ImagePlanEntry = { assetId: string; src: string; header: boolean };

function projectLoadedImages(
  plan: readonly ImagePlanEntry[],
  images: Record<string, HTMLImageElement>,
  previousHeaders: ReadonlyMap<string, HTMLImageElement>
) {
  const projected: Record<string, HTMLImageElement> = {};
  const headers = new Map<string, HTMLImageElement>();
  for (const entry of plan) {
    const image = resolvePlannedImage(entry, images, previousHeaders);
    if (!image) continue;
    projected[entry.assetId] = image;
    if (entry.header && isDecodedHeader(image)) headers.set(entry.src, image);
  }
  return { images: projected, headers };
}

function isDecodedHeader(image: HTMLImageElement): boolean {
  return image.complete && image.naturalWidth > 0;
}

function resolvePlannedImage(
  entry: ImagePlanEntry,
  images: Record<string, HTMLImageElement>,
  previousHeaders: ReadonlyMap<string, HTMLImageElement>
) {
  const owned = images[entry.assetId];
  if (owned?.src === entry.src) return owned;
  return entry.header ? previousHeaders.get(entry.src) : undefined;
}

function retainEquivalentImages(
  previous: Record<string, HTMLImageElement>,
  next: Record<string, HTMLImageElement>
) {
  return Object.keys(previous).length === Object.keys(next).length &&
    Object.entries(next).every(([key, image]) => previous[key] === image)
    ? previous
    : next;
}

type ImageDemandContext = { project: VideoProject; assetUrls: Record<string, string> };

function sameImageDemand(previous: PreviewImageResourceDemand, next: PreviewImageResourceDemand) {
  return (
    previous.assets.size === next.assets.size &&
    previous.headers.size === next.headers.size &&
    [...next.assets].every((key) => previous.assets.has(key)) &&
    [...next.headers].every(([key, clip]) => previous.headers.get(key)?.assetId === clip.assetId)
  );
}

/** One latest demand owns publication eligibility; decoded work can survive cancellation privately. */
function createImageDemandOwner(changed: () => void, publishCached: () => void) {
  let context: ImageDemandContext | undefined;
  let current: { plan: PreviewImageResourceDemand; signal: AbortSignal | undefined } | undefined;
  let alive = true;
  let deferred = false;
  return {
    bind(project: VideoProject, assetUrls: Record<string, string>) {
      if (context?.project !== project || context.assetUrls !== assetUrls) {
        context = { project, assetUrls };
        current = undefined;
        deferred = false;
      }
      return context;
    },
    get plan() {
      return current?.plan;
    },
    register(
      bound: ImageDemandContext,
      frames: readonly VideoCompositionFrame[],
      signal?: AbortSignal
    ) {
      if (!alive || bound !== context || signal?.aborted) return;
      const next = collectPreviewImageResourceDemand(frames);
      const different = !current || !sameImageDemand(current.plan, next);
      current = { plan: different ? next : current!.plan, signal };
      if (different) changed();
      if (deferred) {
        deferred = false;
        publishCached();
      }
    },
    canPublish(key: string) {
      return (
        alive &&
        !!current &&
        !current.signal?.aborted &&
        (current.plan.assets.has(key) || current.plan.headers.has(key))
      );
    },
    deferPublication() {
      deferred = true;
    },
    mount() {
      alive = true;
    },
    dispose() {
      alive = false;
      current = undefined;
      deferred = false;
    },
  };
}

function useFrameImageDemand(
  project: VideoProject,
  assetUrls: Record<string, string>,
  publishCached: () => void
) {
  const [, changed] = useReducer((version: number) => version + 1, 0);
  const ownerRef = useRef<ReturnType<typeof createImageDemandOwner> | null>(null);
  ownerRef.current ??= createImageDemandOwner(changed, publishCached);
  const owner = ownerRef.current;
  const context = owner.bind(project, assetUrls);
  useEffect(() => {
    owner.mount();
    return () => owner.dispose();
  }, [owner]);
  const prepareImages = useMemo(
    () => async (frames: readonly VideoCompositionFrame[], signal?: AbortSignal) => {
      owner.register(context, frames, signal);
    },
    [owner, context]
  );
  return { owner, context, prepareImages };
}

function mergeDemandClips(active: VideoProjectClip[], demand?: PreviewImageResourceDemand) {
  const clips = new Map(active.map((clip) => [clip.id, clip]));
  for (const clip of demand?.headers.values() ?? [])
    if (!clips.has(clip.id)) clips.set(clip.id, clip);
  return [...clips.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function activeImageKeys(project: VideoProject, clips: VideoProjectClip[]) {
  const keys = resolveActiveImageAssetIds(project, clips);
  for (const clip of clips)
    if (
      (clip.type === 'VIDEO' || clip.type === 'IMAGE') &&
      clip.windowHeader &&
      !project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
    )
      keys.add(windowHeaderImageKey(clip.id, clip.windowHeader));
  return keys;
}

export function usePreviewStageImageBank(
  project: VideoProject,
  activeClips: VideoProjectClip[],
  assetUrls: Record<string, string>
) {
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});
  const cacheRef = useRef<Record<string, HTMLImageElement>>({});
  const demand = useFrameImageDemand(project, assetUrls, () => setImages({ ...cacheRef.current }));
  const required = demand.owner.plan;
  const activeKeys = useRef(new Set<string>());
  activeKeys.current = activeImageKeys(project, activeClips);
  // Animated camera geometry does not supply image assets or window headers.
  const imageClips = mergeDemandClips(
    activeClips.filter(
      (clip) =>
        clip.type !== 'VIDEO' ||
        !project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
    ),
    required
  );
  const retainedClips = useRef(imageClips);
  if (
    retainedClips.current.length !== imageClips.length ||
    imageClips.some((clip, index) => clip !== retainedClips.current[index])
  )
    retainedClips.current = imageClips;
  const clips = retainedClips.current;
  const nextPlan = useMemo(() => {
    const headerImages = projectWindowHeaderImages(project, clips);
    const sources = {
      ...assetUrls,
      ...Object.fromEntries(headerImages.map(({ key, src }) => [key, src])),
    };
    const activeIds = resolveActiveImageAssetIds(project, clips);
    for (const key of required?.assets ?? []) activeIds.add(key);
    headerImages.forEach(({ key }) => activeIds.add(key));
    return [...activeIds].sort().map((assetId) => ({
      assetId,
      src: sources[assetId] ?? '',
      header: headerImages.some(({ key }) => key === assetId),
    }));
  }, [project, clips, assetUrls, required]);
  const planRef = useRef(nextPlan);
  if (
    planRef.current.length !== nextPlan.length ||
    nextPlan.some((entry, index) => {
      const previous = planRef.current[index];
      return (
        !previous ||
        entry.assetId !== previous.assetId ||
        entry.src !== previous.src ||
        entry.header !== previous.header
      );
    })
  )
    planRef.current = nextPlan;
  const imagePlan = planRef.current;
  for (const entry of imagePlan)
    if (!required?.assets.has(entry.assetId) && !required?.headers.has(entry.assetId))
      activeKeys.current.add(entry.assetId);
  const projection = useRef<{
    images: Record<string, HTMLImageElement>;
    headers: Map<string, HTMLImageElement>;
  }>({
    images: {},
    headers: new Map(),
  });
  const next = useMemo(
    () => projectLoadedImages(imagePlan, images, projection.current.headers),
    [imagePlan, images]
  );
  projection.current = {
    images: retainEquivalentImages(projection.current.images, next.images),
    headers: next.headers,
  };
  const currentImages = projection.current.images;

  useEffect(() => {
    cacheRef.current = { ...projection.current.images };
    setImages({ ...cacheRef.current });

    let cancelled = false;
    imagePlan.forEach(({ assetId, src }) => {
      if (!src || cacheRef.current[assetId]?.src === src) {
        return;
      }

      const image = new Image();
      const settle = () => {
        if (cancelled) return;
        cacheRef.current[assetId] = image;
        if (activeKeys.current.has(assetId) || demand.owner.canPublish(assetId))
          setImages({ ...cacheRef.current });
        else demand.owner.deferPublication();
      };
      image.onload = settle;
      image.onerror = settle;
      image.src = src;
    });

    return () => {
      cancelled = true;
    };
  }, [imagePlan, demand.owner]);

  return useMemo(
    () => ({ images: currentImages, prepareImages: demand.prepareImages }),
    [currentImages, demand.prepareImages]
  );
}
