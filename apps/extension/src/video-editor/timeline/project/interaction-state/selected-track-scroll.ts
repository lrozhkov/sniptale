import { useLayoutEffect, useRef } from 'react';
import type { VideoEditorSelection } from '../../../contracts/selection';
import { RULER_HEIGHT } from './helpers';
import type { MutableRefObject } from 'react';
import type { TimelineTrackLayoutModel } from '../tracks/layout';
import { syncTimelineTrackScrollIntoView } from './scroll-sync';

export function useTimelineSelectedTrackAutoScroll(params: {
  selectedTrackId: string | null;
  selection: VideoEditorSelection;
  timelineRef: MutableRefObject<HTMLDivElement | null>;
  trackLayoutModel: TimelineTrackLayoutModel;
  trackListRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const effectId =
    params.selection.kind === 'effect-instance' ? params.selection.effectInstanceId : null;
  const clipId =
    params.selection.kind === 'clip'
      ? params.selection.clipId
      : params.selection.kind === 'clip-group'
        ? params.selection.anchorClipId
        : null;
  const motionSelection =
    params.selection.kind === 'motion-region' || params.selection.kind === 'motion-connection';
  const lastSelection = useRef({ trackId: params.selectedTrackId, effectId, clipId });

  useLayoutEffect(() => {
    // A motion press retains its media-track context; revealing that track would move the pressed utility row.
    if (motionSelection) {
      lastSelection.current = { trackId: null, effectId: null, clipId: null };
      return;
    }
    const selectedTrackId = params.selectedTrackId;

    if (!selectedTrackId) {
      lastSelection.current = { trackId: null, effectId: null, clipId: null };
      return;
    }

    if (
      lastSelection.current.trackId === selectedTrackId &&
      lastSelection.current.effectId === effectId &&
      lastSelection.current.clipId === clipId
    ) {
      return;
    }

    const selectedTrackLayout = params.trackLayoutModel.layoutByTrackId.get(selectedTrackId);
    const timeline = params.timelineRef.current;
    const trackList = params.trackListRef.current;
    if (!selectedTrackLayout || !timeline || !trackList) {
      return;
    }

    const selectedObject = effectId
      ? [...timeline.querySelectorAll<HTMLElement>('[data-clip-fx]')].find(
          (node) => node.dataset['clipFx'] === effectId
        )
      : clipId
        ? [...timeline.querySelectorAll<HTMLElement>('[data-project-timeline-clip]')].find(
            (node) => node.dataset['projectTimelineClip'] === clipId
          )
        : undefined;
    const bounds = selectedObject?.getBoundingClientRect();
    const viewport = timeline.getBoundingClientRect();
    // A browser can reveal a pressed clip before its scroll event mirrors the rail.
    // Do not move that visible target using the rail's older scroll position.
    if (
      bounds &&
      bounds.height > 0 &&
      bounds.top >= viewport.top + RULER_HEIGHT &&
      bounds.bottom <= viewport.top + timeline.clientHeight
    ) {
      lastSelection.current = { trackId: selectedTrackId, effectId, clipId };
      return;
    }

    // Rendered press targets include history/lane offsets. Keep visible items in place.
    const target =
      bounds && bounds.height > 0
        ? {
            top:
              bounds.top - timeline.getBoundingClientRect().top + timeline.scrollTop - RULER_HEIGHT,
            height: bounds.height,
          }
        : { top: selectedTrackLayout.top, height: selectedTrackLayout.rowHeight };
    syncTimelineTrackScrollIntoView({
      timeline,
      trackHeight: target.height,
      trackList,
      trackTop: target.top,
    });
    lastSelection.current = { trackId: selectedTrackId, effectId, clipId };
  }, [
    motionSelection,
    clipId,
    effectId,
    params.selectedTrackId,
    params.timelineRef,
    params.trackLayoutModel,
    params.trackListRef,
  ]);
}
