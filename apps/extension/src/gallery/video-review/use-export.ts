import type { VideoProjectExportTimeEstimate } from '../../features/video/project/types/export';
import { useReviewSizeEstimate } from './use-size-estimate';
import { useReviewExportSettings } from './use-review-export-settings';
import { configuredReviewExportPlan } from '../../workflows/video-review/export-configuration';
import { createReviewFragment } from '../../features/video/review/fragment';
import { useEffect, useRef, useState } from 'react';
import {
  inspectReviewMedia,
  type ReviewMediaIndex,
  type ReviewRenderSettings,
} from '../../workflows/video-review/media-index';
import {
  exportReviewedVideo,
  QuickEditExportUnavailable,
} from '../../workflows/video-review/export-lifecycle';
import {
  type QuickEditExportPlan,
  type QuickEditExportReason,
} from '../../features/video/review/advanced/effective';
import { downloadGalleryBlob } from '../shared/download';
import type { LoadedReview } from './use-session';
import type { ReviewAnchor } from '../../features/video/review/types';

type ReviewExportBlocker = { context: string; reasons: readonly QuickEditExportReason[] };

type ExportResult = Awaited<ReturnType<typeof exportReviewedVideo>>;

/** Export starts only after debounced editor content reaches the shared session. */
export function prepareReviewExporter(
  exporter: ReturnType<typeof useReviewExport>,
  run: (action: () => Promise<unknown>) => Promise<unknown>,
  flushPending: () => Promise<void>,
  pause: () => void
): ReturnType<typeof useReviewExport> {
  const start = async (
    destination: 'gallery' | 'download' = 'gallery',
    selection?: Extract<ReviewAnchor, { kind: 'range' }>
  ) => {
    await run(async () => {
      pause();
      await flushPending();
      await exporter.start(destination, selection);
    });
  };
  return {
    ...exporter,
    start,
    downloadSelection: (selection) => start('download', selection),
    download: async () => {
      await run(async () => {
        pause();
        await flushPending();
        await exporter.download();
      });
    },
  };
}

type ReviewExportProgress = {
  phase: 'idle' | 'exporting' | 'publishing';
  progress: number;
  timeEstimate: VideoProjectExportTimeEstimate | null;
};

/** Phase transitions invalidate advisory timing; progress is disposable presentation state. */
function useReviewExportProgress() {
  const [state, setState] = useState<ReviewExportProgress>({
    phase: 'idle',
    progress: 0,
    timeEstimate: null,
  });
  return {
    ...state,
    changePhase: (phase: ReviewExportProgress['phase']) =>
      setState((current) => ({
        phase,
        progress: phase === 'exporting' ? 0 : current.progress,
        timeEstimate: null,
      })),
    setProgress: (progress: number) => setState((current) => ({ ...current, progress })),
    setTimeEstimate: (timeEstimate: VideoProjectExportTimeEstimate | null) =>
      setState((current) => ({ ...current, timeEstimate })),
  };
}

/** Media inspection has its own cancellable lifetime, independent of an export attempt. */
function useReviewSourceIndex(file: File) {
  const [sourceIndex, setIndex] = useState<ReviewMediaIndex | null>(null);
  const [indexing, setIndexing] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setIndex(null);
    setIndexing(true);
    void inspectReviewMedia(file, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setIndex(value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setIndexing(false);
      });
    return () => controller.abort();
  }, [file]);
  return { sourceIndex, indexing };
}

/** Adapts page lifetime to workflow cancellation; the workflow owns publication and cleanup. */
export function useReviewExport(resource: LoadedReview) {
  const { sourceIndex, indexing } = useReviewSourceIndex(resource.file);
  const state = resource.session.getSnapshot();
  const { index, renderSettings, setRenderSettings, checkingCodecs } = useReviewExportSettings(
    sourceIndex,
    {
      ui: state.snapshot.workspace.advanced.ui,
      ...state.document.advancedContent,
    }
  );
  const { phase, progress, timeEstimate, changePhase, setProgress, setTimeEstimate } =
    useReviewExportProgress();
  const [failed, setFailed] = useState(false);
  const context = reviewExportContext(resource, renderSettings);
  const [blocked, setBlocked] = useState<ReviewExportBlocker | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const active = useRef<AbortController | null>(null);
  const publishing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    setResult(null);
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, [resource.file]);
  /** Export plan from the applied changes; unavailable reasons are shown verbatim. */
  const plan = (selection?: Extract<ReviewAnchor, { kind: 'range' }>) =>
    reviewExportPlan(resource, index, renderSettings, selection);
  const sizeEstimate = useReviewSizeEstimate({
    resource,
    index,
    renderSettings,
    context,
    enabled: !checkingCodecs && phase === 'idle' && plan().kind !== 'unavailable',
  });
  const start = async (
    destination: 'gallery' | 'download' = 'gallery',
    selection?: Extract<ReviewAnchor, { kind: 'range' }>
  ) => {
    if (active.current || !index || checkingCodecs) return;
    sizeEstimate.cancel();
    const attemptContext = reviewExportContext(resource, renderSettings);
    const currentPlan = plan(selection);
    if (currentPlan.kind === 'unavailable') {
      setBlocked({
        context: reviewExportContext(resource, renderSettings),
        reasons: currentPlan.reasons,
      });
      return;
    }
    setBlocked(null);
    const controller = new AbortController();
    active.current = controller;
    publishing.current = false;
    setFailed(false);
    changePhase('exporting');
    try {
      const value = await exportReviewedVideo({
        renderSettings,
        snapshot: resource.session.getSnapshot().snapshot,
        index,
        signal: controller.signal,
        destination,
        ...(selection ? { selection } : {}),
        onProgress: (fraction) => {
          if (mounted.current) setProgress(Math.round(fraction * 100));
        },
        onTimeEstimate: (estimate) => {
          if (active.current === controller && !controller.signal.aborted && !publishing.current)
            setTimeEstimate(estimate);
        },
        onPublishing: () => {
          publishing.current = true;
          if (mounted.current) changePhase('publishing');
        },
      });
      if (!mounted.current || controller.signal.aborted) await value.release?.();
      else {
        if (destination === 'download')
          downloadGalleryBlob(value.file, value.receipt.filename, value.release, () => {
            if (mounted.current) setFailed(true);
          });
        if (!selection) setResult(value);
      }
    } catch (error) {
      if (error instanceof QuickEditExportUnavailable) {
        if (mounted.current && !controller.signal.aborted)
          setBlocked({ context: attemptContext, reasons: error.reasons });
      } else if (mounted.current && !controller.signal.aborted) setFailed(true);
    } finally {
      active.current = null;
      publishing.current = false;
      if (mounted.current) changePhase('idle');
    }
  };
  return {
    index,
    indexing,
    phase,
    progress,
    timeEstimate,
    failed,
    blocked: blocked?.context === context ? blocked.reasons : null,
    checkingCodecs,
    sizeEstimate: sizeEstimate.status,
    setSizeEstimateVisible: sizeEstimate.setVisible,
    result,
    plan,
    renderSettings,
    setRenderSettings,
    start,
    retryAssetAvailability: () => {
      if (!active.current) setBlocked(clearMissingAssetBlocker);
    },
    downloadSelection: (selection: Extract<ReviewAnchor, { kind: 'range' }>) =>
      start('download', selection),
    cancel: () => {
      if (!publishing.current) {
        active.current?.abort();
        setTimeEstimate(null);
      }
    },
    download: () =>
      downloadReviewExport({
        resource,
        renderSettings,
        plan: plan(),
        setBlocked,
        render: () => start('download'),
      }),
  };
}

/** Successful resource recovery clears only the corresponding export reason. */
function clearMissingAssetBlocker(current: ReviewExportBlocker | null) {
  if (!current?.reasons.includes('asset-missing')) return current;
  const reasons = current.reasons.filter((reason) => reason !== 'asset-missing');
  return reasons.length ? { ...current, reasons } : null;
}

/** One applied-state capability plan for all export entry points. */
function reviewExportPlan(
  resource: LoadedReview,
  index: ReviewMediaIndex | null,
  renderSettings: ReviewRenderSettings,
  selection?: Extract<ReviewAnchor, { kind: 'range' }>
): QuickEditExportPlan {
  const state = resource.session.getSnapshot();
  const fragment =
    selection && index
      ? createReviewFragment({
          selection,
          duration: index.duration,
          boundaries: index.boundaries,
          snapToKeyframes: state.snapshot.workspace.advanced.ui.mode !== 'advanced',
          edits: state.document.edits,
        })
      : null;
  return configuredReviewExportPlan({
    index,
    renderSettings,
    document: fragment ? { ...state.document, edits: fragment.edits } : state.document,
    advanced: {
      ui: state.snapshot.workspace.advanced.ui,
      ...state.document.advancedContent,
    },
    ...(index ? { videoCopyBoundaries: index.boundaries } : {}),
  });
}

/** Bind failures to the actual committed input after the export entry point has flushed edits. */
function reviewExportContext(resource: LoadedReview, settings: ReviewRenderSettings): string {
  const { workspace } = resource.session.getSnapshot().snapshot;
  return JSON.stringify([
    workspace.aggregateId,
    workspace.sourceAssetId,
    workspace.revision,
    workspace.advanced.ui.mode,
    settings,
  ]);
}

/** Download keeps copy-through admission separate from rendered export execution. */
async function downloadReviewExport(args: {
  resource: LoadedReview;
  renderSettings: ReviewRenderSettings;
  plan: QuickEditExportPlan;
  setBlocked(value: ReviewExportBlocker): void;
  render(): Promise<void>;
}) {
  const { resource, renderSettings, plan } = args;
  if (plan.kind === 'unavailable') {
    args.setBlocked({
      context: reviewExportContext(resource, renderSettings),
      reasons: plan.reasons,
    });
    return;
  }
  const state = resource.session.getSnapshot();
  const applied =
    plan.video === 'render' || plan.audio === 'process' || state.document.edits.length > 0;
  if (!applied) downloadGalleryBlob(resource.file, resource.filename);
  else await args.render();
}
