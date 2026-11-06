import { createNativePreviewPresentationSession } from '../../../../preview/stage/canvas/presentation-session';
import type { NativePreviewGpuOutput } from '../../../../preview/stage/scene/types';
import { useContext, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { WorkspacePreviewContext } from '../../../../runtime/controller/composition/contexts';
import type { VideoCompositionCameraState } from '../../../../../features/video/composition/types';
import { createVideoPreviewFrameMaterializer } from '../../../../preview/cache/materializer';
import { createVideoPreviewRenderIdentity } from '../../../../preview/cache/revision';
import {
  resolveCursorFramingView,
  type FramingPreviewProps,
  type useFramingInteraction,
} from './framing-preview-interaction';
import { evaluateMotionSpatial } from '../../../../../features/video/composition/motion/spatial';
import { resolveMotionOverlayZoomMode } from '../../../../../features/video/project/motion';
import { resolveVideoCompositionCamera } from '../../../../../features/video/composition/motion';
import { resolveProjectCursorCameraPlan } from '../../../../../features/video/composition/motion/project-follow';
import { VideoMotionFocusMode } from '../../../../../features/video/project/types';
import { isVideoProjectUtilityLaneVisible } from '../../../../../features/video/project/utility-lanes';

interface FramingRequest {
  project: FramingPreviewProps['project'];
  region: FramingPreviewProps['region'];
  overview: boolean;
  camera: VideoCompositionCameraState;
  key: string;
}
interface FramingResult {
  output?: NativePreviewGpuOutput;
  canvas: HTMLCanvasElement;
  nominalScale: number;
  viewport?: VideoCompositionCameraState;
  plan?: ReturnType<typeof resolveProjectCursorCameraPlan> | null;
}

export function useFramingFrame(
  props: FramingPreviewProps,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  gpuHostRef: React.RefObject<HTMLDivElement | null>
) {
  const { project, region, assetUrls } = props;
  const renderer = useContext(WorkspacePreviewContext)?.preferences.preferences.renderer ?? 'gpu';
  const identity = useFramingSourceIdentity(project);
  const time = Math.min(project.duration, region.startTime + region.duration / 2);
  const key = JSON.stringify([
    renderer,
    time,
    Object.entries(assetUrls).sort(([a], [b]) => a.localeCompare(b)),
  ]);
  const [request, setRequest] = useState(() => ({ key, identity, project, assetUrls, time }));
  // Camera edits change composition, not the decoded source frame or its runtime.
  if (request.key !== key || request.identity !== identity)
    setRequest({ key, identity, project, assetUrls, time });
  const [frame, setFrame] = useState<{
    request: typeof request;
    hasFrame: boolean;
    nominalScale?: number;
    failed: boolean;
    viewport?: VideoCompositionCameraState | undefined;
    plan?: ReturnType<typeof resolveProjectCursorCameraPlan> | null | undefined;
  } | null>(null);
  const [hasPresentedFrame, setHasPresentedFrame] = useState(false);
  const presenterRef = useRef<ReturnType<typeof createNativePreviewPresentationSession> | null>(
    null
  );
  const activeGeneration = useRef<AbortController | null>(null);
  const previousTransaction = useRef<Promise<void>>(Promise.resolve());
  useLayoutEffect(() => {
    const presenter = createNativePreviewPresentationSession({
      fallback: () => canvasRef.current,
      host: () => gpuHostRef.current,
      role: 'inspector',
    });
    presenter.mount();
    presenterRef.current = presenter;
    return () => {
      activeGeneration.current?.abort();
      presenterRef.current = null;
      presenter.dispose();
    };
  }, [canvasRef, gpuHostRef]);
  const [retry, setRetry] = useState(0);
  const latest = useRef<FramingRequest | null>(null);
  const enqueue = useRef<((request: FramingRequest) => void) | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = new AbortController();
    activeGeneration.current = controller;
    const predecessor = previousTransaction.current;
    const materializer = createVideoPreviewFrameMaterializer({
      previewRenderer: renderer,
      assetUrls: request.assetUrls,
      ownerDocument: canvas.ownerDocument,
      project: { ...request.project, motionRegions: [] },
      rasterSize: {
        width: 480,
        height: Math.max(2, Math.round((480 * request.project.height) / request.project.width)),
      },
    });
    const queue = createFramingRenderQueue({
      predecessor,
      render: async (next) => {
        const prepared = prepareFramingRequest(next, request.time);
        const presenter = presenterRef.current;
        if (!presenter) throw new Error('Inspector presentation is unavailable.');
        const result = await materializer.renderFrameWithPresentation(
          request.time,
          controller.signal,
          prepared.camera,
          presenter.acquire
        );
        return {
          canvas: result.canvas,
          ...(result.presentation.output ? { output: result.presentation.output } : {}),
          ...prepared,
        };
      },
      signal: controller.signal,
      present: (result) => {
        const presenter = presenterRef.current;
        if (!presenter) throw new Error('Inspector presentation is unavailable.');
        if (!result.output) {
          canvas.width = result.canvas.width;
          canvas.height = result.canvas.height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Inspector fallback context is unavailable.');
          context.drawImage(result.canvas, 0, 0);
        }
        presenter.publish(result.output ?? null, () => {
          setFrame({
            request,
            hasFrame: true,
            nominalScale: result.nominalScale,
            failed: false,
            viewport: result.viewport,
            plan: result.plan,
          });
          setHasPresentedFrame(true);
        });
      },
      fail: () =>
        setFrame((previous) => ({
          ...(previous?.request === request ? previous : {}),
          request,
          hasFrame: previous?.request === request && previous.hasFrame,
          failed: true,
        })),
    });
    enqueue.current = queue;
    if (latest.current) queue(latest.current);
    return () => {
      enqueue.current = null;
      controller.abort();
      if (activeGeneration.current === controller) activeGeneration.current = null;
      const completed = queue.settled().finally(() => materializer.dispose());
      previousTransaction.current = completed;
      void completed.catch(() => {});
    };
  }, [request, retry, canvasRef, renderer]);
  const update = useCallback(
    (camera: VideoCompositionCameraState, overview: boolean) => {
      const next = { project, region, overview, camera, key: JSON.stringify(camera) };
      latest.current = next;
      enqueue.current?.(next);
    },
    [project, region]
  );
  return {
    update,
    visible: hasPresentedFrame,
    ready: frame?.request === request && frame.hasFrame,
    failed: frame?.request === request && frame.failed,
    reload: () => setRetry((value) => value + 1),
    viewport: frame?.request === request ? frame.viewport : undefined,
    plan: frame?.request === request ? frame.plan : undefined,
    nominalScale: frame?.request === request ? frame.nominalScale : undefined,
  };
}

function prepareFramingRequest(input: FramingRequest, time: number) {
  if (input.region.focusMode !== VideoMotionFocusMode.CURSOR)
    return { camera: input.camera, nominalScale: input.region.scale };
  const viewport = resolveVideoCompositionCamera({
    project: input.project,
    currentTime: time,
    actions: [],
    cursorSample: null,
  });
  const plan = isVideoProjectUtilityLaneVisible(input.project, 'camera')
    ? resolveProjectCursorCameraPlan(input.project, input.region)
    : null;
  const world = resolveCursorFramingView(input.project, input.overview, viewport);
  const camera = resolveFramingRenderCamera(input, input.overview, world, viewport);
  return { camera, viewport, plan, nominalScale: input.region.scale };
}

/** Rendering owns the selected target pose; gestures consume only its projected world. */
export function resolveFramingRenderCamera(
  props: Pick<FramingPreviewProps, 'project' | 'region'>,
  overview: boolean,
  view: Pick<
    ReturnType<typeof useFramingInteraction>,
    'left' | 'top' | 'width' | 'height' | 'viewport'
  >,
  cursorViewport?: VideoCompositionCameraState
): VideoCompositionCameraState {
  const { project, region } = props;
  const spatial = overview
    ? undefined
    : region.focusMode === VideoMotionFocusMode.CURSOR && region.cursorComposition !== undefined
      ? cursorViewport?.spatial
      : evaluateMotionSpatial(project, null, region, 1);
  return {
    ...(spatial ? { spatial } : {}),
    viewportX: view.left,
    viewportY: view.top,
    viewportWidth: view.width,
    viewportHeight: view.height,
    focusPoint: { x: view.left + view.width / 2, y: view.top + view.height / 2 },
    scale: project.width / view.width,
    regionId: region.id,
    motionBlurAmount: 0,
    overlayZoomMode: resolveMotionOverlayZoomMode(region.overlayZoomMode),
    ...(!overview && region.sourceBinding?.coordinateSpace === 'source-window'
      ? view.viewport
      : {}),
  };
}

/** One active render and one latest request; preparation starts after an inspector paint. */
function createFramingRenderQueue(params: {
  predecessor: Promise<void>;
  render: (request: FramingRequest) => Promise<FramingResult>;
  signal: AbortSignal;
  present: (result: FramingResult) => void;
  fail: () => void;
}) {
  let latest: FramingRequest | null = null;
  let running: Promise<void> | null = null;
  const afterPaint = () =>
    new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        cancelAnimationFrame(frame);
        if (timer !== null) clearTimeout(timer);
        params.signal.removeEventListener('abort', finish);
        resolve();
      };
      const frame = requestAnimationFrame(() => {
        timer = setTimeout(finish, 0);
      });
      params.signal.addEventListener('abort', finish, { once: true });
    });
  const drain = async () => {
    try {
      try {
        await params.predecessor;
      } catch {
        if (!params.signal.aborted) params.fail();
        return;
      }
      while (latest && !params.signal.aborted) {
        await afterPaint();
        if (params.signal.aborted || !latest) break;
        const current = latest;
        let result: FramingResult | undefined;
        let accepted = false;
        try {
          result = await params.render(current);
          if (!params.signal.aborted && current === latest) {
            params.present(result);
            accepted = true;
          }
        } catch {
          if (!params.signal.aborted && current === latest) params.fail();
        } finally {
          if (!accepted) result?.output?.release();
        }
        if (current === latest) break;
      }
    } finally {
      running = null;
    }
  };
  const enqueue = (request: FramingRequest) => {
    if (
      params.signal.aborted ||
      (latest?.key === request.key &&
        latest.overview === request.overview &&
        (request.region.focusMode !== VideoMotionFocusMode.CURSOR ||
          (latest.project === request.project && latest.region === request.region)))
    )
      return;
    latest = request;
    if (!running) {
      running = drain();
      void running.catch(() => {});
    }
  };
  return Object.assign(enqueue, { settled: () => running ?? Promise.resolve() });
}

/** Immutable editor snapshots replace changed fields; motion and metadata do not change this source. */
function useFramingSourceIdentity(project: FramingPreviewProps['project']) {
  const previous = useRef<{ inputs: Map<string, unknown>; identity: string } | null>(null);
  const inputs = Object.entries(project).filter(
    ([key]) => !['motionRegions', 'name', 'createdAt', 'updatedAt'].includes(key)
  );
  if (
    !previous.current ||
    previous.current.inputs.size !== inputs.length ||
    inputs.some(([key, value]) => !Object.is(previous.current!.inputs.get(key), value))
  ) {
    previous.current = {
      inputs: new Map(inputs),
      identity: createVideoPreviewRenderIdentity({ ...project, motionRegions: [] }),
    };
  }
  return previous.current.identity;
}
