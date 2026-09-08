import { useEffect, useMemo, useState } from 'react';
import { createVideoPreviewFrameMaterializer } from '../../../../preview/cache/materializer';
import { createVideoPreviewRenderIdentity } from '../../../../preview/cache/revision';
import type { FramingPreviewProps } from './framing-preview-interaction';

export function useFramingFrame(
  props: FramingPreviewProps,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const { project, region, assetUrls } = props;
  const identity = useMemo(
    () => createVideoPreviewRenderIdentity({ ...project, motionRegions: [] }),
    [project]
  );
  const time = Math.min(project.duration, region.startTime + region.duration / 2);
  const key = JSON.stringify([
    identity,
    time,
    Object.entries(assetUrls).sort(([a], [b]) => a.localeCompare(b)),
  ]);
  const [request, setRequest] = useState(() => ({ key, project, assetUrls, time }));
  // A new project object is also published for focus edits and autosave. Only the
  // unzoomed composition, sampled time and media URLs invalidate the decoded frame.
  if (request.key !== key) setRequest({ key, project, assetUrls, time });
  const [frame, setFrame] = useState<{
    request: typeof request;
    status: 'ready' | 'error';
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const ready = frame?.request === request && frame.status === 'ready';
  const failed = frame?.request === request && frame.status === 'error';
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    const materializer = createVideoPreviewFrameMaterializer({
      assetUrls: request.assetUrls,
      ownerDocument: canvas.ownerDocument,
      project: { ...request.project, motionRegions: [] },
      rasterSize: {
        width: 480,
        height: Math.max(2, Math.round((480 * request.project.height) / request.project.width)),
      },
    });
    void materializer
      .renderFrame(request.time, controller.signal)
      .then((source) => {
        if (controller.signal.aborted) return;
        canvas.width = source.width;
        canvas.height = source.height;
        canvas.getContext('2d')?.drawImage(source, 0, 0);
        setFrame({ request, status: 'ready' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFrame({ request, status: 'error' });
      });
    return () => {
      controller.abort();
      materializer.dispose();
    };
  }, [request, retry, canvasRef]);
  return {
    ready,
    failed,
    retry,
    reload: () => {
      setFrame(null);
      setRetry((value) => value + 1);
    },
  };
}
