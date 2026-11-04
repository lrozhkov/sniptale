import { useEffect, useMemo, useRef, useState } from 'react';
import { createReviewRecordingHistorySource } from '../../workflows/video-review/recording-review';
import {
  attachReviewRecordingWindow,
  projectReviewTelemetry,
  reviewRecordingWindow,
  type ReviewTelemetryMarker,
} from '../../features/video/review/telemetry';
import type { ReviewSelection } from '../../features/video/review/types';
import type { LoadedReview } from './use-session';

type Resource = Pick<LoadedReview, 'historyProject' | 'telemetry' | 'source'>;
type Range = { start: number; end: number };
type Request = { time: number; range?: Range; explicit: boolean; reach: number };
type Prepared = Awaited<ReturnType<ReturnType<typeof createReviewRecordingHistorySource>['read']>>;
type Owner = {
  reader: ReturnType<typeof createReviewRecordingHistorySource>;
  includeCursor: boolean;
  project: Resource['historyProject'];
  telemetry: Resource['telemetry'];
  latest: Request;
  requested: boolean;
  running: boolean;
  failed: boolean;
  disposed: boolean;
};
type View = { owner: Owner | null; prepared?: Prepared; request: Request; failed: boolean };
function covers(view: View | null, owner: Owner, request: Request): boolean {
  if (
    view?.owner !== owner ||
    !view.prepared ||
    !owner.reader.covers(view.prepared.project, request.time)
  )
    return false;
  if (
    request.explicit &&
    request.range &&
    (!view.request.range ||
      view.request.range.start > request.range.start ||
      view.request.range.end < request.range.end)
  )
    return false;
  return (
    view.request.reach >= request.reach &&
    (request.reach <= 1 || Math.abs(view.request.time - request.time) <= 1)
  );
}
/** Each preview or viewport owns one active read and one latest request. */
export function useReviewRecordingHistory(
  resource: Resource,
  time: number,
  selection: ReviewSelection,
  options: { range?: Range; includeCursor?: boolean; reach?: number } = {}
) {
  const includeCursor = options.includeCursor !== false;
  const reach = Math.max(1, options.reach ?? 1);
  const range =
    options.range ??
    (reach > 1
      ? { start: Math.max(0, time - reach), end: Math.min(resource.source.duration, time + reach) }
      : undefined);
  const explicit = options.range !== undefined;
  const rangeStart = range?.start;
  const rangeEnd = range?.end;
  const request = useMemo<Request>(
    () => ({
      time,
      ...(rangeStart !== undefined && rangeEnd !== undefined
        ? { range: { start: rangeStart, end: rangeEnd } }
        : {}),
      explicit,
      reach,
    }),
    [time, rangeStart, rangeEnd, explicit, reach]
  );
  const [current, setCurrent] = useState<Owner | null>(null);
  const owner =
    current &&
    current.project === resource.historyProject &&
    current.telemetry === resource.telemetry &&
    current.includeCursor === includeCursor
      ? current
      : null;
  useEffect(() => {
    if (!resource.historyProject || !resource.telemetry) {
      setCurrent(null);
      return;
    }
    const next: Owner = {
      includeCursor,
      reader: createReviewRecordingHistorySource(
        resource.historyProject,
        resource.telemetry,
        undefined,
        { includeCursor }
      ),
      project: resource.historyProject,
      telemetry: resource.telemetry,
      latest: { time: 0, explicit: false, reach: 1 },
      requested: false,
      running: false,
      failed: false,
      disposed: false,
    };
    setCurrent(next);
    return () => {
      next.disposed = true;
      next.reader.dispose();
    };
  }, [resource.historyProject, resource.telemetry, includeCursor]);
  const [view, setView] = useState<View | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  useEffect(() => {
    if (!owner || owner.disposed || owner.failed) return;
    owner.latest = request;
    if (covers(view, owner, request)) return;
    owner.requested = true;
    if (owner.running) return;
    owner.running = true;
    void (async () => {
      try {
        while (owner.requested && !owner.disposed) {
          owner.requested = false;
          const active = owner.latest;
          const prepared = active.range
            ? await owner.reader.read(active.time, active.range)
            : await owner.reader.read(active.time);
          if (owner.disposed) return;
          const candidate: View = { owner, prepared, request: active, failed: false };
          if (covers(candidate, owner, owner.latest)) {
            owner.requested = false;
            setView(candidate);
          } else owner.requested = true;
        }
      } catch {
        if (!owner.disposed) {
          owner.failed = true;
          setView({ owner, request: owner.latest, failed: true });
        }
      } finally {
        owner.running = false;
      }
    })();
  }, [owner, request, retryGeneration, view]);
  const prepared = owner && covers(view, owner, request) ? view?.prepared : undefined;
  const pinned = useRef<{ owner: Owner; marker: ReviewTelemetryMarker } | null>(null);
  const telemetry = useMemo(() => {
    const base = resource.telemetry;
    if (!owner || !base) return base;
    const facts = prepared?.telemetry ?? {
      ...base,
      ...(base.recordingEvents
        ? {
            actionEvents: [],
            signals: base.signals.filter((signal) => signal.kind === 'static-frame'),
          }
        : {}),
      ...(!includeCursor
        ? { cursorTrack: null }
        : base.cursorTrajectory && base.cursorTrack
          ? { cursorTrack: { ...base.cursorTrack, samples: [] } }
          : {}),
    };
    const selected = selection.kind === 'telemetry' ? selection.ref : null;
    const window = reviewRecordingWindow(facts);
    const markers =
      window?.markers ?? projectReviewTelemetry(facts, resource.source.duration).markers;
    const same = (marker: ReviewTelemetryMarker) =>
      selected && marker.ref.kind === selected.kind && marker.ref.id === selected.id;
    const visible = selected && markers.find(same);
    const match =
      visible ||
      (view?.owner === owner &&
        view.prepared &&
        reviewRecordingWindow(view.prepared.telemetry)?.markers.find(same));
    if (match) pinned.current = { owner, marker: match };
    const pin = pinned.current;
    if (
      !selected ||
      pin?.owner !== owner ||
      pin.marker.ref.kind !== selected.kind ||
      pin.marker.ref.id !== selected.id
    )
      pinned.current = null;
    const keep = pinned.current?.marker;
    return attachReviewRecordingWindow(facts, {
      ...window,
      markers: keep && !visible ? [...markers, keep] : markers,
    });
  }, [
    resource.telemetry,
    resource.source.duration,
    owner,
    prepared,
    selection,
    view,
    includeCursor,
  ]);
  return {
    telemetry,
    pending: !!owner && !prepared && !owner.failed,
    initialLoading: !!owner && !owner.failed && !(view?.owner === owner && view.prepared),
    failed: !!owner && view?.owner === owner && view.failed,
    incomplete: !!(
      (resource.telemetry?.cursorTrajectory &&
        resource.telemetry.cursorTrajectory.state !== 'complete') ||
      (resource.telemetry?.recordingEvents &&
        resource.telemetry.recordingEvents.state !== 'complete')
    ),
    retry() {
      if (owner) {
        owner.failed = false;
        setRetryGeneration((value) => value + 1);
      }
    },
  };
}
