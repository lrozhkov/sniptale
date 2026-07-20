import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type {
  TimelineClipPreviewMap,
  TimelinePreviewViewport,
} from '../../contracts/timeline-preview';
import type { VideoProject } from '../../../features/video/project/types/index';
import {
  loadTimelineVideoPreviewFrames,
  type TimelineVideoFrameLoadPlan,
  type TimelineVideoFrameLoadResult,
} from './timeline-frame-loader';
import {
  buildTimelinePreviewPlans,
  getNextTimelinePreviewFrameBatch,
  getTimelinePreviewPlanKey,
  resolveTimelinePreviewFrameOwner,
} from './timeline-preview-plans';
import {
  cleanupRemovedPreviewAssets,
  createTimelinePreviewMap,
  revokeCachedPreviewUrls,
  revokePreviewUrls,
  type TimelinePreviewFrame,
  type TimelinePreviewPlan,
} from './timeline-preview-cache';

export type TimelineVideoFrameLoader = (
  plan: TimelineVideoFrameLoadPlan
) => Promise<readonly TimelineVideoFrameLoadResult[]>;

interface UseTimelineClipPreviewsOptions {
  loadVideoFrames?: TimelineVideoFrameLoader;
  suspended?: boolean;
  viewport?: TimelinePreviewViewport | null;
}

type SetTimelinePreviews = (
  updater: (currentPreviews: TimelineClipPreviewMap) => TimelineClipPreviewMap
) => void;

interface TimelinePreviewLoadingEffectParams {
  generatedUrlCacheRef: { current: Map<string, TimelinePreviewFrame> };
  assetUrls: Record<string, string>;
  loadVideoFrames: TimelineVideoFrameLoader;
  loadRevision: number;
  planKey: string;
  plans: readonly TimelinePreviewPlan[];
  setLoadRevision: Dispatch<SetStateAction<number>>;
  setPreviews: SetTimelinePreviews;
  suspended: boolean;
}

export function useTimelineClipPreviews(
  project: VideoProject | null,
  assetUrls: Record<string, string>,
  options: UseTimelineClipPreviewsOptions = {}
): TimelineClipPreviewMap {
  const loadVideoFrames = options.loadVideoFrames ?? loadTimelineVideoPreviewFrames;
  const [previews, setPreviews] = useState<TimelineClipPreviewMap>({});
  const [loadRevision, setLoadRevision] = useState(0);
  const generatedUrlCacheRef = useRef(new Map<string, TimelinePreviewFrame>());
  const plans = useMemo(
    () => buildTimelinePreviewPlans(project, assetUrls, options.viewport ?? null),
    [assetUrls, options.viewport, project]
  );
  const planKey = useMemo(() => getTimelinePreviewPlanKey(plans), [plans]);

  useEffect(() => () => revokeCachedPreviewUrls(generatedUrlCacheRef.current), []);
  useTimelinePreviewLoadingEffect({
    generatedUrlCacheRef,
    loadVideoFrames,
    loadRevision,
    planKey,
    plans,
    setLoadRevision,
    setPreviews,
    suspended: options.suspended ?? false,
    assetUrls,
  });

  return previews;
}

function useTimelinePreviewLoadingEffect(params: TimelinePreviewLoadingEffectParams): void {
  const {
    generatedUrlCacheRef,
    assetUrls,
    loadVideoFrames,
    loadRevision,
    planKey,
    plans,
    setLoadRevision,
    setPreviews,
    suspended,
  } = params;

  useEffect(() => {
    const abortController = new AbortController();
    cleanupRemovedPreviewAssets(generatedUrlCacheRef.current, assetUrls);
    setTimelinePreviewMap({ generatedUrlCacheRef, plans, setPreviews });

    if (suspended) {
      return () => abortController.abort();
    }

    void loadAndApplyMissingPreviewEntries({
      abortController,
      generatedUrlCacheRef,
      loadVideoFrames,
      plans,
      setLoadRevision,
      setPreviews,
      assetUrls,
    });
    return () => {
      abortController.abort();
    };
  }, [
    assetUrls,
    generatedUrlCacheRef,
    loadVideoFrames,
    loadRevision,
    planKey,
    plans,
    setLoadRevision,
    setPreviews,
    suspended,
  ]);
}

function setTimelinePreviewMap(params: {
  generatedUrlCacheRef: { current: Map<string, TimelinePreviewFrame> };
  plans: readonly TimelinePreviewPlan[];
  setPreviews: SetTimelinePreviews;
}): void {
  params.setPreviews((currentPreviews) =>
    replaceTimelinePreviewMapIfChanged(
      currentPreviews,
      createTimelinePreviewMap(params.plans, params.generatedUrlCacheRef.current)
    )
  );
}

async function loadAndApplyMissingPreviewEntries(params: {
  abortController: AbortController;
  assetUrls: Record<string, string>;
  generatedUrlCacheRef: { current: Map<string, TimelinePreviewFrame> };
  loadVideoFrames: TimelineVideoFrameLoader;
  plans: readonly TimelinePreviewPlan[];
  setLoadRevision: Dispatch<SetStateAction<number>>;
  setPreviews: SetTimelinePreviews;
}): Promise<void> {
  const loadedEntries = await loadMissingPreviewEntries(
    params.abortController,
    params.plans,
    params.generatedUrlCacheRef.current,
    params.loadVideoFrames
  );

  if (params.abortController.signal.aborted) {
    revokePreviewUrls(loadedEntries.map((entry) => entry.url));
    return;
  }

  loadedEntries.forEach((entry) => {
    const owner = resolveTimelinePreviewFrameOwner(params.plans, entry.cacheKey);
    if (!owner || params.assetUrls[owner.assetId] !== owner.assetUrl) {
      URL.revokeObjectURL(entry.url);
      return;
    }

    params.generatedUrlCacheRef.current.set(entry.cacheKey, {
      assetId: owner.assetId,
      assetUrl: owner.assetUrl,
      sourceTime: entry.sourceTime,
      url: entry.url,
    });
  });
  setTimelinePreviewMap({
    generatedUrlCacheRef: params.generatedUrlCacheRef,
    plans: params.plans,
    setPreviews: params.setPreviews,
  });
  if (loadedEntries.length > 0) {
    scheduleTimelinePreviewNextBatch(params.abortController.signal, params.setLoadRevision);
  }
}

async function loadMissingPreviewEntries(
  abortController: AbortController,
  plans: readonly TimelinePreviewPlan[],
  generatedUrlCache: Map<string, TimelinePreviewFrame>,
  loadVideoFrames: TimelineVideoFrameLoader
) {
  const batchPlan = getNextTimelinePreviewFrameBatch(plans, generatedUrlCache);
  if (!batchPlan) {
    return [];
  }

  try {
    return await loadVideoFrames({
      assetUrl: batchPlan.assetUrl,
      samples: batchPlan.samples,
      signal: abortController.signal,
    });
  } catch {
    return [];
  }
}

function scheduleTimelinePreviewNextBatch(
  signal: AbortSignal,
  setLoadRevision: Dispatch<SetStateAction<number>>
): void {
  const refreshPreviewBatch = () => {
    if (!signal.aborted) {
      setLoadRevision((revision) => revision + 1);
    }
  };
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number;
  };

  if (idleWindow.requestIdleCallback) {
    idleWindow.requestIdleCallback(refreshPreviewBatch, { timeout: 500 });
    return;
  }

  globalThis.setTimeout(refreshPreviewBatch, 0);
}

function replaceTimelinePreviewMapIfChanged(
  currentPreviews: TimelineClipPreviewMap,
  nextPreviews: TimelineClipPreviewMap
): TimelineClipPreviewMap {
  return areTimelinePreviewMapsEqual(currentPreviews, nextPreviews)
    ? currentPreviews
    : nextPreviews;
}

function areTimelinePreviewMapsEqual(
  left: TimelineClipPreviewMap,
  right: TimelineClipPreviewMap
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => {
    const leftPreview = left[key];
    const rightPreview = right[key];
    if (!leftPreview || !rightPreview) {
      return false;
    }

    return (
      leftPreview.kind === rightPreview.kind &&
      leftPreview.urls.length === rightPreview.urls.length &&
      leftPreview.urls.every((url, index) => url === rightPreview.urls[index])
    );
  });
}
