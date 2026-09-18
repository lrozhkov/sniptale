import { useMemo, useRef } from 'react';
import { createReviewTimeMap, sourceToReviewResult } from '../../features/video/review/timeline';
import type { ReviewEdit } from '../../features/video/review/types';

/**
 * One result-time authority for the editor: placements, camera evaluation, and the
 * advanced lanes all convert through the shared ReviewTimeMap built from the edits.
 */
export function useReviewTimeMap(
  source: { duration: number },
  edits: readonly ReviewEdit[],
  time: number
) {
  const timeMap = useMemo(
    () => createReviewTimeMap(source.duration, edits),
    [source.duration, edits]
  );
  const outputTime = useMemo(
    () => sourceToReviewResult(time, timeMap.getSegments()),
    [time, timeMap]
  );
  const lastOutputTime = useRef(0);
  if (outputTime !== null) lastOutputTime.current = outputTime;
  return {
    timeMap,
    outputTime,
    sceneOutputTime: outputTime ?? lastOutputTime.current,
    resultDuration: timeMap.getDuration(),
    toOutputTime: (source: number) => sourceToReviewResult(source, timeMap.getSegments()),
  };
}
