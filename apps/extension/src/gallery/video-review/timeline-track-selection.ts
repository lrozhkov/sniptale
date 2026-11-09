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
  return { track, select };
}
