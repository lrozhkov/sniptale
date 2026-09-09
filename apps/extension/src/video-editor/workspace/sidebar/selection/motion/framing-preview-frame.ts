import { useEffect, useMemo, useRef, useState } from 'react';
import type { VideoCompositionCameraState } from '../../../../../features/video/composition/types';
import { createVideoPreviewFrameMaterializer } from '../../../../preview/cache/materializer';
import { createVideoPreviewRenderIdentity } from '../../../../preview/cache/revision';
import type { FramingPreviewProps } from './framing-preview-interaction';

export function useFramingFrame(
  props: FramingPreviewProps,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  camera: VideoCompositionCameraState
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
  // Camera edits change composition, not the decoded source frame or its runtime.
  if (request.key !== key) setRequest({ key, project, assetUrls, time });
  const [frame, setFrame] = useState<{
    request: typeof request;
    hasFrame: boolean;
    failed: boolean;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const cameraKey = JSON.stringify(camera);
  const latestCamera = useRef(camera);
  latestCamera.current = camera;
  const enqueue = useRef<((camera: VideoCompositionCameraState) => void) | null>(null);
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
    const queue = createFramingRenderQueue({
      render: (nextCamera) => materializer.renderFrame(request.time, controller.signal, nextCamera),
      signal: controller.signal,
      present: (source) => {
        canvas.width = source.width;
        canvas.height = source.height;
        canvas.getContext('2d')?.drawImage(source, 0, 0);
        setFrame({ request, hasFrame: true, failed: false });
      },
      fail: () =>
        setFrame((previous) => ({
          request,
          hasFrame: previous?.request === request && previous.hasFrame,
          failed: true,
        })),
    });
    enqueue.current = queue;
    queue(latestCamera.current);
    return () => {
      enqueue.current = null;
      controller.abort();
      materializer.dispose();
    };
  }, [request, retry, canvasRef]);
  useEffect(() => {
    enqueue.current?.(latestCamera.current);
  }, [cameraKey]);
  return {
    ready: frame?.request === request && frame.hasFrame,
    failed: frame?.request === request && frame.failed,
    reload: () => setRetry((value) => value + 1),
  };
}

/** One active render and one latest request: no parallel effects or stale frame publication. */
function createFramingRenderQueue(params: {
  render: (camera: VideoCompositionCameraState) => Promise<HTMLCanvasElement>;
  signal: AbortSignal;
  present: (canvas: HTMLCanvasElement) => void;
  fail: () => void;
}) {
  let latest: { camera: VideoCompositionCameraState; key: string } | null = null;
  let running = false;
  const drain = async () => {
    running = true;
    while (latest && !params.signal.aborted) {
      const current = latest;
      try {
        const canvas = await params.render(current.camera);
        if (!params.signal.aborted && current === latest) params.present(canvas);
      } catch {
        if (!params.signal.aborted && current === latest) params.fail();
      }
      if (current === latest) break;
    }
    running = false;
  };
  return (camera: VideoCompositionCameraState) => {
    const key = JSON.stringify(camera);
    if (params.signal.aborted || latest?.key === key) return;
    latest = { camera, key };
    if (!running) void drain();
  };
}
