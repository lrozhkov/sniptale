import {
  presentationEnvelopeOpacity,
  resolveVideoProjectSceneEdgePlan,
} from '../../project/scene/edge-fades';
import type { VideoProject } from '../../project/types/model';

/** Paint after the complete scene; editor chrome remains outside the supplied backing rectangle. */
export function drawVideoProjectSceneEdges(
  context: CanvasRenderingContext2D,
  project: Pick<VideoProject, 'duration' | 'sceneEdges'>,
  time: number,
  bounds?: { x: number; y: number; width: number; height: number }
): void {
  const plan = resolveVideoProjectSceneEdgePlan(project);
  const alpha = presentationEnvelopeOpacity(plan.visualEnvelope, time);
  if (alpha <= 0) return;
  const frame = bounds ?? {
    x: 0,
    y: 0,
    width: context.canvas.width,
    height: context.canvas.height,
  };
  context.save();
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = alpha;
    context.globalCompositeOperation = 'source-over';
    context.filter = 'none';
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.fillStyle = time >= plan.visualEnvelope.fadeIn ? plan.endColor : plan.color;
    context.fillRect(frame.x, frame.y, frame.width, frame.height);
  } finally {
    context.restore();
  }
}
