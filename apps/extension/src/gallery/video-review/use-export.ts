import { useEffect, useRef, useState } from 'react';
import {
  inspectReviewMedia,
  type ReviewMediaIndex,
} from '../../workflows/video-review/media-index';
import { exportReviewedVideo } from '../../workflows/video-review/export-lifecycle';
import { downloadGalleryBlob } from '../shared/download';
import type { LoadedReview } from './use-session';
import type { ReviewAnchor } from '../../features/video/review/types';

type ExportResult = Awaited<ReturnType<typeof exportReviewedVideo>>;
/** Adapts page lifetime to workflow cancellation; the workflow owns publication and cleanup. */
export function useReviewExport(resource: LoadedReview) {
  const [index, setIndex] = useState<ReviewMediaIndex | null>(null);
  const [indexing, setIndexing] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'exporting' | 'publishing'>('idle');
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
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
  const start = async (
    destination: 'gallery' | 'download' = 'gallery',
    selection?: Extract<ReviewAnchor, { kind: 'range' }>
  ) => {
    if (active.current || !index) return;
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
    } catch {
      if (mounted.current && !controller.signal.aborted) setFailed(true);
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
    result,
    start,
    downloadSelection: (selection: Extract<ReviewAnchor, { kind: 'range' }>) =>
      start('download', selection),
    cancel: () => {
      if (!publishing.current) active.current?.abort();
    },
    download: () => {
      if (!resource.session.getSnapshot().document.edits.length)
        downloadGalleryBlob(resource.file, resource.filename);
      else void start('download');
    },
  };
}
