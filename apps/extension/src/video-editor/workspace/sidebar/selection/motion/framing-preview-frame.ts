import { useEffect, useState } from 'react';
import type { VideoProject } from '../../../../../features/video/project/types';
import { createVideoPreviewFrameMaterializer } from '../../../../preview/cache/materializer';
import type { FramingPreviewProps } from './framing-preview-interaction';

export function useFramingFrame(
  props: FramingPreviewProps,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const { project, region, assetUrls } = props;
  const [frame, setFrame] = useState<{ project: VideoProject; status: 'ready' | 'error' } | null>(
    null
  );
  const [retry, setRetry] = useState(0);
  const ready = frame?.project === project && frame.status === 'ready';
  const failed = frame?.project === project && frame.status === 'error';
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    const materializer = createVideoPreviewFrameMaterializer({
      assetUrls,
      ownerDocument: canvas.ownerDocument,
      project: { ...project, motionRegions: [] },
      rasterSize: {
        width: 480,
        height: Math.max(2, Math.round((480 * project.height) / project.width)),
      },
    });
    const time = Math.min(project.duration, region.startTime + region.duration / 2);
    void materializer
      .renderFrame(time, controller.signal)
      .then((source) => {
        if (controller.signal.aborted) return;
        canvas.width = source.width;
        canvas.height = source.height;
        canvas.getContext('2d')?.drawImage(source, 0, 0);
        setFrame({ project, status: 'ready' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFrame({ project, status: 'error' });
      });
    return () => {
      controller.abort();
      materializer.dispose();
    };
  }, [assetUrls, project, region.startTime, region.duration, retry, canvasRef]);
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
