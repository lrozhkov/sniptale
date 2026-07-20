import type { FrameData } from '../../../../features/highlighter/contracts';

export function getInteractiveFrameOverlayClipPath(frame: FrameData, padding = 8) {
  const x1 = frame.x - padding;
  const y1 = frame.y - padding;
  const x2 = frame.x + frame.width + padding;
  const y2 = frame.y + frame.height + padding;

  return `polygon(
      0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
      ${x1}px ${y1}px, ${x1}px ${y2}px, ${x2}px ${y2}px, ${x2}px ${y1}px, ${x1}px ${y1}px
    )`;
}
