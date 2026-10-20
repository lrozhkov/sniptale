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
  const lastSelection = useRef({ trackId: params.selectedTrackId, effectId });

  useLayoutEffect(() => {
    const selectedTrackId = params.selectedTrackId;

    if (!selectedTrackId) {
      lastSelection.current = { trackId: null, effectId: null };
      return;
    }

    if (
      lastSelection.current.trackId === selectedTrackId &&
      lastSelection.current.effectId === effectId
    ) {
      return;
    }

    const selectedTrackLayout = params.trackLayoutModel.layoutByTrackId.get(selectedTrackId);
    const timeline = params.timelineRef.current;
    const trackList = params.trackListRef.current;
    if (!selectedTrackLayout || !timeline || !trackList) {
      return;
    }

    const effect = effectId
      ? [...timeline.querySelectorAll<HTMLElement>('[data-clip-fx]')].find(
          (node) => node.dataset['clipFx'] === effectId
        )
      : undefined;
    const bounds = effect?.getBoundingClientRect();
    // Reveal the rendered FX interval, including history/lane offsets.
    // Its visible press target must not move to the track origin.
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
    lastSelection.current = { trackId: selectedTrackId, effectId };
  }, [
    effectId,
    params.selectedTrackId,
    params.timelineRef,
    params.trackLayoutModel,
    params.trackListRef,
  ]);
}
