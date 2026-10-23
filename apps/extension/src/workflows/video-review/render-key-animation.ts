import { REVIEW_KEY_VIEWPORT_WIDTH } from '../../features/video/project/action-feedback/key-animation';
import { drawKeystroke } from '../../features/video/composition/draw/effects/keystrokes';
import type { ReviewKeyCue } from '../../features/video/review/key-animation';

/** Latest command wins within a placement, so rapid sequences never paint over each other. */
export function drawReviewKeys(
  context: CanvasRenderingContext2D,
  cues: readonly ReviewKeyCue[],
  time: number,
  output: { width: number; height: number }
) {
  const active = new Map<string, ReviewKeyCue>();
  for (const cue of cues)
    if (time >= cue.start) {
      const previous = active.get(cue.settings.style.position);
      if (!previous || previous.start <= cue.start) active.set(cue.settings.style.position, cue);
    }
  for (const cue of active.values())
    if (time < cue.end)
      drawKeystroke(
        context,
        {
          event: { label: cue.label },
          keyStyle: cue.settings.style,
          progress: (time - cue.start) / (cue.end - cue.start),
        },
        output.width / REVIEW_KEY_VIEWPORT_WIDTH,
        { x: 0, y: 0, width: output.width, height: output.height }
      );
}
