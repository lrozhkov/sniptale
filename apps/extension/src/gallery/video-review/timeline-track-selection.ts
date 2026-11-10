import { useEffect, useRef, useState } from 'react';
import type { QuickEditTrack } from '../../features/video/review/advanced/types';
import type { ReviewBeforeAction } from './note-transitions';

/** Track navigation shares action admission; deferred requests cannot cross source or mode changes. */
export function useReviewTrackSelection(input: {
  sourceId: string | undefined;
  mode: 'basic' | 'advanced';
  editing: boolean;
  selectable: Record<QuickEditTrack, boolean>;
  blocked: boolean;
  beforeAction: ReviewBeforeAction | undefined;
  clearTools(): void;
  activate(track: QuickEditTrack): void;
  onChange?: ((track: QuickEditTrack) => void) | undefined;
}) {
  const [selection, setSelection] = useState({
    sourceId: input.sourceId,
    mode: input.mode,
    track: 'source' as QuickEditTrack,
  });
  const reset =
    selection.sourceId !== input.sourceId ||
    selection.mode !== input.mode ||
    !input.selectable[selection.track];
  const track = reset || input.editing ? 'source' : selection.track;
  const latest = useRef(input);
  latest.current = input;
  useEffect(() => {
    if (
      track === selection.track &&
      selection.sourceId === input.sourceId &&
      selection.mode === input.mode
    )
      return;
    if (reset) latest.current.clearTools();
    setSelection({ sourceId: input.sourceId, mode: input.mode, track });
  }, [track, selection, input.sourceId, input.mode, reset]);
  useEffect(() => {
    latest.current.onChange?.(track);
  }, [track]);
  // Item handlers own edit admission. This capture only changes the transient lane and tools.
  const focusItem = (next: QuickEditTrack) => {
    const current = latest.current;
    if (!current.selectable[next] || current.blocked || next === track) return;
    current.clearTools();
    setSelection({ sourceId: current.sourceId, mode: current.mode, track: next });
  };
  const select = (next: QuickEditTrack) => {
    if (!input.selectable[next] || input.blocked) return;
    (input.beforeAction ?? ((action) => action()))(() => {
      const current = latest.current;
      if (
        current.sourceId !== input.sourceId ||
        current.mode !== input.mode ||
        !current.selectable[next] ||
        current.blocked
      )
        return;
      if (next !== track) {
        current.clearTools();
        setSelection({ sourceId: input.sourceId, mode: input.mode, track: next });
      }
      current.activate(next);
    });
  };
  return { track, select, focusItem };
}
