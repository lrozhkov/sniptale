import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { buildReviewTimeMap, mapReviewAnchor } from '../../features/video/review/timeline';
import { buildReviewActionAudioPlan } from '../../features/video/review/action-audio';
import { projectReviewTelemetry } from '../../features/video/review/telemetry';
import { hasQuickEditActionAudio } from '../../features/video/review/advanced/audio-plan';
import { resolveReviewOutputProfile } from '../../workflows/video-review/render-settings';
import type { VideoProjectExportTimeEstimate } from '../../features/video/project/types/export';
import { useReviewSizeEstimate } from './use-size-estimate';
import { useReviewExportSettings } from './use-review-export-settings';
import { configuredReviewExportPlan } from '../../workflows/video-review/export-configuration';
import { createReviewFragment } from '../../features/video/review/fragment';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  resolveQuickEditEffectiveFeatures,
} from '../../features/video/review/advanced/effective';
import { downloadGalleryBlob } from '../shared/download';
import type { LoadedReview } from './use-session';
import type { ReviewAnchor } from '../../features/video/review/types';
import { createReviewExportDiagnostics } from '../../workflows/video-review/export-diagnostics';

type ReviewExportBlocker = {
  context: string;
  reasons: readonly QuickEditExportReason[];
  cameraConflicts?: QuickEditExportUnavailable['cameraConflicts'];
};

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

/** Keeps dismissible feedback independent from the retained report receipt. */
function useReviewExportCompletion({
  setProgress,
  setTimeEstimate,
}: Pick<ReturnType<typeof useReviewExportProgress>, 'setProgress' | 'setTimeEstimate'>) {
  const [failed, setFailed] = useState(false);
  const [completion, setCompletion] = useState<{
    destination: 'gallery' | 'download';
    mediaId: string | null;
  } | null>(null);
  const completionGeneration = useRef(0);
  const dismissCompletion = useCallback(() => {
    completionGeneration.current++;
    setCompletion(null);
  }, []);
  const showCompletion = (
    value: NonNullable<typeof completion>,
    generation = completionGeneration.current
  ) => {
    if (completionGeneration.current !== generation) return;
    setProgress(100);
    setTimeEstimate(null);
    setCompletion(value);
  };
  const beginAttempt = () => {
    dismissCompletion();
    setFailed(false);
    return completionGeneration.current;
  };
  return {
    completion,
    completionGeneration,
    dismissCompletion,
    showCompletion,
    failed,
    setFailed,
    beginAttempt,
  };
}

function useReviewExportLifetime(
  file: File,
  setResult: (value: null) => void,
  dismissCompletion: () => void,
  clearTimeEstimate: (value: null) => void
) {
  const active = useRef<AbortController | null>(null);
  const publishing = useRef(false);
  const mounted = useRef(true);
  const abortActive = useCallback(() => active.current?.abort(), []);
  useEffect(() => {
    mounted.current = true;
    setResult(null);
    dismissCompletion();
    return () => {
      mounted.current = false;
      abortActive();
    };
  }, [file, setResult, dismissCompletion, abortActive]);
  const cancel = () => {
    if (!publishing.current) {
      abortActive();
      clearTimeEstimate(null);
    }
  };
  return { active, publishing, mounted, cancel };
}

/** Pure full-sequence timing for the export inspector; fragment options do not change it. */
function reviewPresentationMetadata(
  index: ReviewMediaIndex | null,
  advanced: Parameters<typeof resolveReviewOutputProfile>[1],
  edits: Parameters<typeof buildReviewTimeMap>[1],
  renderSettings: ReviewRenderSettings | undefined
) {
  const presentation = advanced.presentation;
  const hasBookends =
    advanced.ui.mode === 'advanced' &&
    !!presentation &&
    (presentation.intro.mode !== 'none' || presentation.outro.mode !== 'none');
  if (!index || !presentation || advanced.ui.mode !== 'advanced')
    return { hasBookends, duration: null };
  const result = planReviewPresentationSequence({
    settings: presentation,
    mainDuration: buildReviewTimeMap(index.duration, edits).at(-1)?.resultEnd ?? 0,
    fragmentOffset: 0,
    includeBookends: true,
    rate: resolveReviewOutputProfile(index, advanced, renderSettings).rate,
  });
  return { hasBookends, duration: result.ok ? result.plan : null };
}

/** Adapts page lifetime to workflow cancellation; the workflow owns publication and cleanup. */
export function useReviewExport(resource: LoadedReview) {
  const { sourceIndex, indexing } = useReviewSourceIndex(resource.file);
  const { document, snapshot } = resource.session.getSnapshot();
  const advanced = { ui: snapshot.workspace.advanced.ui, ...document.advancedContent };
  const { index, renderSettings, setRenderSettings, checkingCodecs } = useReviewExportSettings(
    sourceIndex,
    advanced
  );
  const { hasBookends, duration: presentationDuration } = reviewPresentationMetadata(
    index,
    advanced,
    document.edits,
    renderSettings
  );
  const { phase, progress, timeEstimate, changePhase, setProgress, setTimeEstimate } =
    useReviewExportProgress();
  const feedback = useReviewExportCompletion({ setProgress, setTimeEstimate });
  const context = reviewExportContext(resource, renderSettings);
  const [blocked, setBlocked] = useState<ReviewExportBlocker | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const { active, publishing, mounted, cancel } = useReviewExportLifetime(
    resource.file,
    setResult,
    feedback.dismissCompletion,
    setTimeEstimate
  );
  const plan = (selection?: Extract<ReviewAnchor, { kind: 'range' }>) =>
    reviewExportPlan(resource, index, renderSettings, selection);
  const choices = reviewExportChoices(resource, index, renderSettings);
  const sizeEstimate = useReviewSizeEstimate({
    resource,
    index,
    renderSettings,
    context,
    enabled: !checkingCodecs && phase === 'idle' && choices.rendering,
  });
  const start = async (
    destination: 'gallery' | 'download' = 'gallery',
    selection?: Extract<ReviewAnchor, { kind: 'range' }>
  ) => {
    if (active.current || !index || checkingCodecs) return;
    const generation = feedback.beginAttempt();
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
    const diagnostics = createReviewExportDiagnostics({ destination, signal: controller.signal });
    active.current = controller;
    publishing.current = false;
    changePhase('exporting');
    try {
      const value = await exportReviewedVideo({
        diagnostics,
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
            if (mounted.current && feedback.completionGeneration.current === generation) {
              feedback.dismissCompletion();
              feedback.setFailed(true);
            }
          });
        if (!selection) setResult(value);
        feedback.showCompletion(
          { destination, mediaId: destination === 'gallery' ? value.receipt.mediaId : null },
          generation
        );
      }
    } catch (error) {
      diagnostics.reportFailure(error);
      if (error instanceof QuickEditExportUnavailable) {
        if (mounted.current && !controller.signal.aborted)
          setBlocked({
            context: attemptContext,
            reasons: error.reasons,
            cameraConflicts: error.cameraConflicts,
          });
      } else if (mounted.current && !controller.signal.aborted) feedback.setFailed(true);
    } finally {
      active.current = null;
      publishing.current = false;
      if (mounted.current) changePhase('idle');
    }
  };
  return {
    index,
    hasBookends,
    presentationDuration,
    indexing,
    phase,
    progress,
    timeEstimate,
    failed: feedback.failed,
    blocked: blocked?.context === context ? blocked.reasons : null,
    cameraConflicts: blocked?.context === context ? (blocked.cameraConflicts ?? []) : [],
    checkingCodecs,
    sizeEstimate: sizeEstimate.status,
    setSizeEstimateVisible: sizeEstimate.setVisible,
    result,
    completion: feedback.completion,
    dismissCompletion: feedback.dismissCompletion,
    plan,
    sourceVideoAvailable: choices.sourceVideoAvailable,
    renderSettings,
    setRenderSettings,
    start,
    retryAssetAvailability: () => {
      if (!active.current) setBlocked(clearMissingAssetBlocker);
    },
    downloadSelection: (selection: Extract<ReviewAnchor, { kind: 'range' }>) =>
      start('download', selection),
    cancel,
    download: async () => {
      if (active.current) return;
      feedback.beginAttempt();
      await downloadReviewExport({
        resource,
        renderSettings,
        plan: plan(),
        setBlocked,
        render: () => start('download'),
        onCopy: () => feedback.showCompletion({ destination: 'download', mediaId: null }),
        onFailure: () => {
          if (mounted.current) feedback.setFailed(true);
        },
      });
    },
  };
}

/** Source preservation and size-probe intent follow the same committed export plan. */
function reviewExportChoices(
  resource: LoadedReview,
  index: ReviewMediaIndex | null,
  settings: ReviewRenderSettings
) {
  const current = reviewExportPlan(resource, index, settings);
  const { quality: _quality, ...sourceSettings } = settings;
  const source =
    settings.quality === undefined ? current : reviewExportPlan(resource, index, sourceSettings);
  return {
    sourceVideoAvailable: source.kind === 'ready' && source.video === 'copy',
    rendering: current.kind === 'ready' && current.video === 'render',
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
  const advanced = { ui: state.snapshot.workspace.advanced.ui, ...state.document.advancedContent };
  const fullMap = buildReviewTimeMap(resource.source.duration, state.document.edits);
  const actionPlan = buildReviewActionAudioPlan({
    markers: resource.telemetry
      ? projectReviewTelemetry(resource.telemetry, resource.source.duration).markers
      : [],
    settings: advanced.actionAudio ?? [],
    segments: fullMap,
    applied: resolveQuickEditEffectiveFeatures(advanced).actionsApplied,
  });
  const ranges = fragment
    ? mapReviewAnchor({ kind: 'range', start: fragment.start, end: fragment.end }, fullMap).ranges
    : null;
  const actionAudioPresent = hasQuickEditActionAudio(
    { plan: actionPlan, offset: 0, busGain: 1 },
    {
      start: ranges?.[0]?.start ?? (fragment ? actionPlan.duration : 0),
      end: ranges?.at(-1)?.end ?? actionPlan.duration,
    }
  );
  return configuredReviewExportPlan({
    includeBookends: !selection,
    index,
    renderSettings,
    document: fragment ? { ...state.document, edits: fragment.edits } : state.document,
    advanced,
    actionAudioPresent,
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
  onCopy(): void;
  onFailure(): void;
}) {
  const diagnostics = createReviewExportDiagnostics({ destination: 'download', route: 'copy' });
  try {
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
    if (!applied) {
      downloadGalleryBlob(resource.file, resource.filename);
      args.onCopy();
    } else await args.render();
  } catch (error) {
    diagnostics.reportFailure(error);
    args.onFailure();
  }
}
