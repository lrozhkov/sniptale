import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  blocked: boolean,
  preference?: { enabled: boolean; onChange(enabled: boolean): void }
) {
  const [localEnabled, setLocalEnabled] = useState(true);
  const enabled = preference?.enabled ?? localEnabled;
  const setEnabled = preference?.onChange ?? setLocalEnabled;
  const canvas = useRef<HTMLCanvasElement>(null);
  const queue = useRef<ReturnType<typeof createReviewLiveSeekQueue> | null>(null);
  const [presented, setPresented] = useState<{
    input: object;
    anchor: number;
    time: number;
  } | null>(null);
  const shown = useRef<typeof presented>(null);
  const mainFrame = useRef<{ resource: LiveSeekResource; time: number } | null>(null);
  const handoff = useRef<{
    frame: NonNullable<typeof presented>;
    target: number | null;
    resource: LiveSeekResource;
  } | null>(null);
  const latest = useRef({ time: state.time, enabled, blocked, resource });
  latest.current = { time: state.time, enabled, blocked, resource };
  const dismiss = useCallback(() => {
    if (handoff.current || !shown.current) return;
    setPresented(null);
    shown.current = null;
  }, []);
  const cancelHandoff = useCallback(() => {
    if (!handoff.current && !shown.current) return;
    handoff.current = null;
    shown.current = null;
    setPresented(null);
  }, []);
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
  const anchorTime = enabled && !blocked ? state.time : null;
  useEffect(() => {
    if (!handoff.current) dismiss();
    if (!enabled || blocked || !input) return;
    const anchor = latest.current.time;
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
        if (handoff.current || anchor !== latest.current.time) return;
        const node = canvas.current;
        const context = node?.getContext('2d');
        if (!node || !context) return;
        if (node.width !== frame.canvas.width) node.width = frame.canvas.width;
        if (node.height !== frame.canvas.height) node.height = frame.canvas.height;
        context.clearRect(0, 0, node.width, node.height);
        context.drawImage(frame.canvas, 0, 0);
        shown.current = { input, anchor, time };
        setPresented(shown.current);
      },
      dismiss
    );
    queue.current = owner;
    const leave = () => {
      cancelHandoff();
      owner.request(null);
    };
    window.addEventListener('blur', leave);
    return () => {
      window.removeEventListener('blur', leave);
      if (queue.current === owner) queue.current = null;
      owner.dispose();
    };
  }, [
    input,
    enabled,
    blocked,
    anchorTime,
    resource,
    source,
    advanced,
    edits,
    dismiss,
    cancelHandoff,
  ]);
  useLayoutEffect(() => {
    if (!enabled || blocked || (handoff.current && handoff.current.resource !== resource))
      cancelHandoff();
  }, [enabled, blocked, resource, cancelHandoff]);
  const hover = useCallback(
    (time: number | null, resultTime?: number) => {
      if (handoff.current && time !== null) return;
      const result = time === null ? null : (resultTime ?? map.sourceToTimeline(time));
      const end = map.getDuration();
      queue.current?.request(
        result === null
          ? null
          : Math.min(result, Math.max(0, end - Number.EPSILON * Math.max(1, end) * 4))
      );
    },
    [map]
  );
  const clear = useCallback(() => {
    cancelHandoff();
    queue.current?.request(null);
  }, [cancelHandoff]);
  const hold = useCallback(() => {
    if (handoff.current) return;
    const frame = shown.current;
    const current = latest.current;
    if (!frame || !current.enabled || current.blocked || frame.anchor !== current.time) return;
    handoff.current = { frame, target: null, resource: current.resource };
    queue.current?.request(null);
    setPresented(frame);
  }, []);
  const commit = useCallback(
    (time: number) => {
      const pending = handoff.current;
      if (!pending) return;
      pending.target = time;
      const ready = mainFrame.current;
      if (ready?.resource === pending.resource && Math.abs(ready.time - time) <= 0.000002)
        cancelHandoff();
    },
    [cancelHandoff]
  );
  const finishIntent = useCallback(
    (readTime: () => number | undefined) => {
      const pending = handoff.current;
      if (!pending || pending.target !== null) return;
      // Track selection and seeking can be separate handlers of the same pointer event.
      queueMicrotask(() => {
        if (handoff.current !== pending || pending.target !== null) return;
        const time = readTime();
        if (time !== undefined && Math.abs(time - pending.frame.anchor) > 0.000002) commit(time);
        else cancelHandoff();
      });
    },
    [cancelHandoff, commit]
  );
  const onPresentedTime = useCallback(
    (time: number) => {
      mainFrame.current = { resource: latest.current.resource, time };
      const target = handoff.current?.target;
      if (target !== null && target !== undefined && Math.abs(time - target) <= 0.000002)
        cancelHandoff();
    },
    [cancelHandoff]
  );
  return {
    enabled,
    setEnabled,
    canvas,
    hover,
    clear,
    hold,
    commit,
    finishIntent,
    onPresentedTime,
    available: exporter.index !== null && raster !== null,
    visible:
      !!presented &&
      enabled &&
      !blocked &&
      ((handoff.current?.frame === presented && handoff.current.resource === resource) ||
        (presented.input === input && presented.anchor === state.time)),
    time: presented?.time ?? null,
  };
}
