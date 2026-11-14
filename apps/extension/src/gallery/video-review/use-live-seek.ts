import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createReviewPresentationMain,
  type ReviewPresentationMainInput,
} from '../../workflows/video-review/presentation-main';
import { createReviewRecordingRenderSource } from '../../workflows/video-review/recording-render';
import { resolveReviewAssetBytes } from '../../workflows/video-review/asset-bytes';
import { computeQuickEditSceneSize } from '../../features/video/review/advanced/scene';
import { resolveQuickEditEffectiveState } from '../../features/video/review/advanced/effective';
import { createReviewTimeMap } from '../../features/video/review/timeline';
import { resolveOverlayComments } from '../../features/video/review/comments';
import {
  resolvePresentationSettings,
  createNeutralPresentationSettings,
} from '../../features/video/review/advanced/presentation';
import { planReviewPresentationSequence } from '../../features/video/review/presentation-sequence';
import { resolveReviewOutputProfile } from '../../workflows/video-review/render-settings';
import type { QuickPreviewPreferences } from '../../features/video/preview/quick-preferences';
import type { LoadedReview } from './use-session';
import type { useReviewEditorState } from './use-editor-state';

type Frame = Pick<
  Awaited<ReturnType<Awaited<ReturnType<typeof createReviewPresentationMain>>['renderAtTime']>>,
  'canvas' | 'release'
>;
type Renderer = { renderAtTime(time: number): Promise<Frame>; dispose(): void };

/** Advisory seeking owns one decoder job and only the newest pending time; it never drives transport. */
export function createReviewLiveSeekQueue(
  open: (signal: AbortSignal) => Promise<Renderer>,
  present: (frame: Frame, time: number) => void,
  clear: () => void
) {
  const controller = new AbortController();
  let renderer: Renderer | null = null;
  let pending: { time: number; revision: number } | null = null;
  let revision = 0;
  let running = false;
  let disposed = false;
  const pump = async () => {
    if (running || disposed || !pending) return;
    running = true;
    try {
      if (!renderer) {
        const opened = await open(controller.signal);
        if (disposed) {
          opened.dispose();
          return;
        }
        renderer = opened;
      }
      while (pending && !disposed) {
        const request = pending;
        pending = null;
        const frame = await renderer.renderAtTime(request.time);
        try {
          if (!disposed && request.revision === revision) present(frame, request.time);
        } finally {
          frame.release();
        }
      }
    } catch {
      renderer?.dispose();
      renderer = null;
      pending = null;
      if (!disposed) clear();
    } finally {
      running = false;
      if (pending && !disposed) void pump();
    }
  };
  return {
    request(time: number | null) {
      if (disposed) return;
      const next = ++revision;
      pending =
        time !== null && Number.isFinite(time) && time >= 0 ? { time, revision: next } : null;
      if (pending) void pump();
      else clear();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pending = null;
      ++revision;
      controller.abort();
      renderer?.dispose();
      renderer = null;
      clear();
    },
  };
}

type EditorState = ReturnType<typeof useReviewEditorState>;
type LiveSeekState = {
  advanced: EditorState['advanced'];
  source: EditorState['source'];
  time: number;
  snapshot: {
    document: Pick<EditorState['snapshot']['document'], 'edits' | 'annotations' | 'canvasComments'>;
    snapshot: {
      workspace: Pick<EditorState['snapshot']['snapshot']['workspace'], 'effectSnapshots'>;
    };
  };
  exporter: Pick<EditorState['exporter'], 'index' | 'renderSettings'>;
  keyCues: EditorState['keyCues'];
  clickCues: EditorState['clickCues'];
};
type LiveSeekResource = Pick<LoadedReview, 'file' | 'telemetry' | 'historyProject'> & {
  session: Pick<LoadedReview['session'], 'readAnnotationResource'>;
};

/** A separate source/compositor lifetime shares production image rules without seeking or playing the main media. */
export function useReviewLiveSeek(
  resource: LiveSeekResource,
  state: LiveSeekState,
  preferences: QuickPreviewPreferences,
  raster: { width: number; height: number } | null,
  blocked: boolean
) {
  const [enabled, setEnabled] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const queue = useRef<ReturnType<typeof createReviewLiveSeekQueue> | null>(null);
  const [presented, setPresented] = useState<{
    input: object;
    anchor: number;
    time: number;
  } | null>(null);
  const { advanced, snapshot, source, exporter, keyCues, clickCues } = state;
  const edits = snapshot.document.edits;
  const map = useMemo(() => createReviewTimeMap(source.duration, edits), [source.duration, edits]);
  const input = useMemo(() => {
    if (!enabled || blocked || !exporter.index || !raster) return null;
    try {
      const effective = resolveQuickEditEffectiveState(advanced, {
        facts: resource.telemetry,
        source,
      });
      const size = computeQuickEditSceneSize({
        source,
        canvas: effective.canvas,
        background: effective.background,
        windowHeader: effective.windowHeader,
      });
      const profile = resolveReviewOutputProfile(exporter.index, advanced, exporter.renderSettings);
      const planned = planReviewPresentationSequence({
        settings: resolvePresentationSettings(
          effective.presentation ?? createNeutralPresentationSettings()
        ),
        mainDuration: map.getDuration(),
        fragmentOffset: 0,
        includeBookends: true,
        rate: profile.rate,
      });
      return {
        file: resource.file,
        index: exporter.index,
        edits,
        effective,
        effectSnapshots: snapshot.snapshot.workspace.effectSnapshots ?? [],
        comments: effective.overlaysVisible ? resolveOverlayComments(snapshot.document) : [],
        keyCues,
        clickCues,
        fragmentOffset: 0,
        renderer: preferences.renderer,
        fps: exporter.index.frameRate ?? 30,
        dimensions: { canonical: { width: size.width, height: size.height }, backing: raster },
        ...(planned.ok ? { outerFadePlan: planned.plan } : {}),
      } satisfies Omit<ReviewPresentationMainInput, 'signal' | 'readAsset'>;
    } catch {
      return null;
    }
  }, [
    enabled,
    blocked,
    resource,
    advanced,
    source,
    exporter.index,
    exporter.renderSettings,
    edits,
    map,
    raster,
    preferences.renderer,
    snapshot.document,
    snapshot.snapshot.workspace.effectSnapshots,
    keyCues,
    clickCues,
  ]);
  useEffect(() => {
    setPresented(null);
    if (!enabled || blocked || !input) return;
    const anchor = state.time;
    const owner = createReviewLiveSeekQueue(
      async (signal) => {
        const history =
          resource.historyProject && resource.telemetry
            ? createReviewRecordingRenderSource({
                project: resource.historyProject,
                telemetry: resource.telemetry,
                source,
                advanced,
                edits,
              })
            : null;
        try {
          const main = await createReviewPresentationMain({
            ...input,
            signal,
            readAsset: async (id) => {
              signal.throwIfAborted();
              const local = await resource.session.readAnnotationResource(id, signal);
              signal.throwIfAborted();
              return local ?? resolveReviewAssetBytes(id);
            },
            ...(history ? { recordingHistory: history } : {}),
          });
          return {
            renderAtTime: main.renderAtTime,
            dispose() {
              main.dispose();
              history?.dispose();
            },
          };
        } catch (error) {
          history?.dispose();
          throw error;
        }
      },
      (frame, time) => {
        const node = canvas.current;
        const context = node?.getContext('2d');
        if (!node || !context) return;
        if (node.width !== frame.canvas.width) node.width = frame.canvas.width;
        if (node.height !== frame.canvas.height) node.height = frame.canvas.height;
        context.clearRect(0, 0, node.width, node.height);
        context.drawImage(frame.canvas, 0, 0);
        setPresented({ input, anchor, time });
      },
      () => setPresented(null)
    );
    queue.current = owner;
    const leave = () => owner.request(null);
    window.addEventListener('blur', leave);
    return () => {
      window.removeEventListener('blur', leave);
      if (queue.current === owner) queue.current = null;
      owner.dispose();
    };
  }, [input, enabled, blocked, state.time, resource, source, advanced, edits]);
  const hover = useCallback(
    (time: number | null) => {
      const result = time === null ? null : map.sourceToTimeline(time);
      const end = map.getDuration();
      queue.current?.request(
        result === null
          ? null
          : Math.min(result, Math.max(0, end - Number.EPSILON * Math.max(1, end) * 4))
      );
    },
    [map]
  );
  const clear = useCallback(() => queue.current?.request(null), []);
  return {
    enabled,
    setEnabled,
    canvas,
    hover,
    clear,
    available: exporter.index !== null && raster !== null,
    visible:
      !!presented &&
      enabled &&
      !blocked &&
      presented.input === input &&
      presented.anchor === state.time,
    time: presented?.time ?? null,
  };
}
