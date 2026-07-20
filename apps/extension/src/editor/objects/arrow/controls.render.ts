import { Path } from 'fabric';
import type { Control } from 'fabric';
import { EDITOR_CANVAS_ACCENT, EDITOR_CANVAS_CONTROL_SURFACE } from '../../color/palette/constants';
import type { ArrowPathInstance } from './controls.types';

const hoveredControlKeys = new WeakMap<ArrowPathInstance, string>();

export function createArrowControlCursorHandler(
  controlKey: string,
  cursor: string
): Control['cursorStyleHandler'] {
  return (_eventData, _control, fabricObject) => {
    if (fabricObject instanceof Path && fabricObject.sniptaleType === 'arrow') {
      const arrow = fabricObject as ArrowPathInstance;
      if (hoveredControlKeys.get(arrow) !== controlKey) {
        hoveredControlKeys.set(arrow, controlKey);
        arrow.canvas?.requestRenderAll();
      }
    }

    return cursor;
  };
}

export function createArrowControlRender(
  controlKey: string,
  kind: 'endpoint' | 'insert' | 'point'
): Control['render'] {
  return (ctx, left, top, _styleOverride, fabricObject) => {
    const isHovered =
      fabricObject instanceof Path &&
      fabricObject.sniptaleType === 'arrow' &&
      hoveredControlKeys.get(fabricObject as ArrowPathInstance) === controlKey;
    const radius = getArrowControlRenderRadius(kind, isHovered);

    ctx.save();
    ctx.beginPath();
    ctx.arc(left, top, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
    ctx.strokeStyle = EDITOR_CANVAS_ACCENT;
    ctx.lineWidth = isHovered ? 2 : 1.5;
    ctx.setLineDash(kind === 'insert' ? [3, 3] : []);
    ctx.beginPath();
    ctx.arc(left, top, radius, 0, Math.PI * 2);
    ctx.fillStyle = kind === 'insert' ? 'rgba(255, 255, 255, 0.45)' : EDITOR_CANVAS_CONTROL_SURFACE;
    ctx.fill();
    ctx.stroke();
    if (kind === 'insert') {
      renderInsertPointGlyph(ctx, left, top, radius);
    }
    ctx.restore();
  };
}

function getArrowControlRenderRadius(
  kind: 'endpoint' | 'insert' | 'point',
  isHovered: boolean
): number {
  const base = kind === 'endpoint' ? 5.5 : kind === 'insert' ? 4 : 5;
  return isHovered ? base + 2 : base;
}

function renderInsertPointGlyph(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  radius: number
): void {
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(left - radius * 0.55, top);
  ctx.lineTo(left + radius * 0.55, top);
  ctx.moveTo(left, top - radius * 0.55);
  ctx.lineTo(left, top + radius * 0.55);
  ctx.stroke();
}
