import { useEffect, useRef, useState } from 'react';
import {
  inspectReviewMedia,
  type ReviewMediaIndex,
} from '../../workflows/video-review/media-index';
import {
  exportReviewedVideo,
  QuickEditExportUnavailable,
} from '../../workflows/video-review/export-lifecycle';
import {
  resolveQuickEditExportPlan,
  type QuickEditExportPlan,
  type QuickEditExportReason,
} from '../../features/video/review/advanced/effective';
import { downloadGalleryBlob } from '../shared/download';
import type { LoadedReview } from './use-session';
import type { ReviewAnchor } from '../../features/video/review/types';

type ExportResult = Awaited<ReturnType<typeof exportReviewedVideo>>;

/** Export starts only after debounced editor content reaches the shared session. */
export function prepareReviewExporter(
  exporter: ReturnType<typeof useReviewExport>,
  run: (action: () => Promise<unknown>) => Promise<unknown>,
  flushPending: () => Promise<void>
): ReturnType<typeof useReviewExport> {
  const start = async (
    destination: 'gallery' | 'download' = 'gallery',
    selection?: Extract<ReviewAnchor, { kind: 'range' }>
  ) => {
    await run(async () => {
      await flushPending();
      await exporter.start(destination, selection);
    });
  };
  return {
    ...exporter,
    start,
    downloadSelection: (selection) => start('download', selection),
  };
}

/** Adapts page lifetime to workflow cancellation; the workflow owns publication and cleanup. */
export function useReviewExport(resource: LoadedReview) {
  const [index, setIndex] = useState<ReviewMediaIndex | null>(null);
  const [indexing, setIndexing] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'exporting' | 'publishing'>('idle');
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState<readonly QuickEditExportReason[] | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const active = useRef<AbortController | null>(null);
  const publishing = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    setResult(null);
    setIndex(null);
    setIndexing(true);
    void inspectReviewMedia(resource.file, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setIndex(value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setIndexing(false);
      });
    return () => {
      mounted.current = false;
      controller.abort();
      active.current?.abort();
    };
  }, [resource.file]);
  /** Export plan from the applied changes; unavailable reasons are shown verbatim. */
  const plan = (): QuickEditExportPlan => {
    const state = resource.session.getSnapshot();
    return resolveQuickEditExportPlan({
      document: state.document,
      advanced: {
        ...state.snapshot.workspace.advanced,
        zoom: state.document.advancedContent.zoom,
        background: state.document.advancedContent.background,
        audio: state.document.advancedContent.audio,
      },
      // A source audio track with a probed unavailable codec is a known blocker;
      // clips-only exports defer the authoritative probe to the exporter.
      ...(index?.audioCodec ? { audioProcessingAvailable: !!index.processedAudioCodec } : {}),
      videoRenderAvailable: !!index?.processedVideoCodec,
    });
  };
  const start = async (
    destination: 'gallery' | 'download' = 'gallery',
    selection?: Extract<ReviewAnchor, { kind: 'range' }>
  ) => {
    if (active.current || !index) return;
    const currentPlan = plan();
    if (currentPlan.kind === 'unavailable') {
      setBlocked(currentPlan.reasons);
      return;
    }
    setBlocked(null);
    const controller = new AbortController();
    active.current = controller;
    publishing.current = false;
    setFailed(false);
    setPhase('exporting');
    setProgress(0);
    try {
      const value = await exportReviewedVideo({
        snapshot: resource.session.getSnapshot().snapshot,
        index,
        signal: controller.signal,
        destination,
        ...(selection ? { selection } : {}),
        onProgress: (fraction) => {
          if (mounted.current) setProgress(Math.round(fraction * 100));
        },
        onPublishing: () => {
          publishing.current = true;
          if (mounted.current) setPhase('publishing');
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
        if (mounted.current && !controller.signal.aborted) setBlocked(error.reasons);
      } else if (mounted.current && !controller.signal.aborted) setFailed(true);
    } finally {
      active.current = null;
      publishing.current = false;
      if (mounted.current) setPhase('idle');
    }
  };
  return {
    index,
    indexing,
    phase,
    progress,
    failed,
    blocked,
    result,
    plan,
    /** Ready-plan reasons worth an applied-changes hint; null while nothing is applied. */
    reencode: (): readonly QuickEditExportReason[] | null => {
      const current = plan();
      return current.kind === 'ready' &&
        (current.video === 'render' || current.audio === 'process') &&
        current.reasons.length
        ? current.reasons
        : null;
    },
    start,
    downloadSelection: (selection: Extract<ReviewAnchor, { kind: 'range' }>) =>
      start('download', selection),
    cancel: () => {
      if (!publishing.current) active.current?.abort();
    },
    download: () => {
      const currentPlan = plan();
      if (currentPlan.kind === 'unavailable') {
        setBlocked(currentPlan.reasons);
        return;
      }
      const state = resource.session.getSnapshot();
      const applied =
        currentPlan.video === 'render' ||
        currentPlan.audio === 'process' ||
        state.document.edits.length > 0;
      if (!applied) downloadGalleryBlob(resource.file, resource.filename);
      else void start('download');
    },
  };
}
