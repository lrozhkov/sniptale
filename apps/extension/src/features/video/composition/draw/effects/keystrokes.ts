import { getActionKeyStyle } from '../../../project/action-style';
import type { VideoCompositionActionState } from '../../types';

/** Positions key labels inside the visible frame; source cursor coordinates do not place captions. */
export function drawKeystroke(
  context: CanvasRenderingContext2D,
  action: VideoCompositionActionState,
  sizeScale: number,
  bounds?: { x: number; y: number; width: number; height: number }
): void {
  const label = action.event.label;
  if (!label) return;
  const style = getActionKeyStyle(action.keyStyle);
  const scale = Math.max(0.2, sizeScale);
  const fontSize = style.fontSize * scale;
  const padding = fontSize * 0.55;
  const margin = style.margin * scale;
  const area = bounds ?? {
    x: 0,
    y: 0,
    width: context.canvas?.width ?? 1920,
    height: context.canvas?.height ?? 1080,
  };
  const available = Math.max(0, area.width - margin * 2);
  const height = Math.min(fontSize * 1.8, Math.max(0, area.height - margin * 2));
  if (available <= padding * 2 || height <= 0) return;
  context.save();
  context.font = `500 ${fontSize}px ${style.fontFamily}`;
  context.textBaseline = 'middle';
  context.textAlign = 'center';
  const width = Math.min(context.measureText(label).width + padding * 2, available);
  const x = style.position.endsWith('left')
    ? area.x + margin
    : style.position.endsWith('right')
      ? area.x + area.width - margin - width
      : area.x + (area.width - width) / 2;
  const top = style.position.startsWith('top');
  const baseY = top ? area.y + margin : area.y + area.height - margin - height;
  const fade =
    style.entrance === 'none'
      ? 1
      : Math.min(1, action.progress / 0.15, (1 - action.progress) / 0.2);
  const travel =
    style.entrance === 'slide'
      ? (1 - Math.min(1, action.progress / 0.2)) ** 3 * fontSize * 0.35
      : 0;
  const y = baseY + (top ? -travel : travel);
  context.globalAlpha *= Math.max(0, fade);
  context.beginPath();
  context.roundRect(x, y, width, height, Math.min(style.cornerRadius * scale, height / 2));
  context.save();
  context.globalAlpha *= style.opacity;
  context.fillStyle = style.background;
  context.fill();
  context.restore();
  context.fillStyle = style.color;
  context.fillText(label, x + width / 2, y + height / 2, Math.max(1, width - padding * 2));
  context.restore();
}
