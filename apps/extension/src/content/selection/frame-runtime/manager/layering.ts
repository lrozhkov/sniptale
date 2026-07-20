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
  const sortedFrames = [...frames].sort((a, b) => getFrameArea(a) - getFrameArea(b));
  const totalFrames = sortedFrames.length;

  return sortedFrames.map((frame, index) => {
    const state = states.get(frame.id) || 'idle';
    return {
      ...frame,
      zIndex: state !== 'idle' ? Z_INDEX_ACTIVE_FRAME : Z_INDEX_FRAMES_BASE + (totalFrames - index),
    };
  });
}
