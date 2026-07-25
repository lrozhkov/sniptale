import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';

const Z_INDEX_FRAMES_BASE = 2147483640;
const Z_INDEX_ACTIVE_FRAME = 2147483644;

function getFrameArea(frame: FrameData): number {
  return frame.width * frame.height;
}

export function getSortedFramesWithZIndex(
  frames: FrameData[],
  states: Map<string, FrameState>
): Array<FrameData & { zIndex: number }> {
  const insertionIndex = new Map(frames.map((frame, index) => [frame.id, index]));
  const sortedFrames = [...frames].sort((a, b) => {
    const areaOrder = getFrameArea(a) - getFrameArea(b);
    if (areaOrder !== 0) return areaOrder;
    return (insertionIndex.get(b.id) ?? 0) - (insertionIndex.get(a.id) ?? 0);
  });
  const totalFrames = sortedFrames.length;

  return sortedFrames.map((frame, index) => {
    const state = states.get(frame.id) || 'idle';
    const isDirectManipulation = state === 'editing' || state === 'resizing';
    return {
      ...frame,
      zIndex: isDirectManipulation
        ? Z_INDEX_ACTIVE_FRAME
        : Z_INDEX_FRAMES_BASE + (totalFrames - index),
    };
  });
}
