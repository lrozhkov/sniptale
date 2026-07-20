import type { Control, FabricObject } from 'fabric';
import {
  DEFAULT_CORNER_CONTROLS,
  EDITOR_CORNER_CONTROL_SIZE,
  EDITOR_CORNER_CONTROL_SIZE_HOVER,
  EDITOR_CORNER_CONTROL_SIZE_HOVER_MIN,
  EDITOR_CORNER_CONTROL_SIZE_MIN,
} from './constants';
import { clamp, isActiveControl } from './base';

type ControlStyleOverride = Parameters<Control['render']>[3];

function getObjectScaledDimension(object: FabricObject, axis: 'height' | 'width'): number {
  const getter = axis === 'width' ? object.getScaledWidth : object.getScaledHeight;
  const fallback = axis === 'width' ? object.width : object.height;

  return Math.abs(getter?.call(object) ?? fallback ?? 0);
}

export function resolveCornerVisualSize(object: FabricObject, hovered: boolean): number {
  const minDimension = Math.min(
    getObjectScaledDimension(object, 'width'),
    getObjectScaledDimension(object, 'height')
  );
  if (minDimension <= 0) {
    return hovered ? EDITOR_CORNER_CONTROL_SIZE_HOVER : EDITOR_CORNER_CONTROL_SIZE;
  }

  const scale = clamp((minDimension - 32) / 72, 0, 1);
  const minSize = hovered ? EDITOR_CORNER_CONTROL_SIZE_HOVER_MIN : EDITOR_CORNER_CONTROL_SIZE_MIN;
  const maxSize = hovered ? EDITOR_CORNER_CONTROL_SIZE_HOVER : EDITOR_CORNER_CONTROL_SIZE;

  return Math.round(minSize + (maxSize - minSize) * scale);
}

function createCornerControlRender(controlKey: string): Control['render'] {
  return function renderCornerControl(
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    _styleOverride: ControlStyleOverride | undefined,
    object: FabricObject
  ): void {
    const size = resolveCornerVisualSize(object, isActiveControl(object, controlKey));
    const radius = size / 2;
    const strokeColor = object.cornerStrokeColor || object.borderColor || '#f97316';

    ctx.save();
    ctx.translate(left, top);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = object.cornerColor || '#f8fafc';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
}

export function patchCornerControl(control: Control | undefined, key: string): void {
  if (!control) {
    return;
  }

  control.sizeX = EDITOR_CORNER_CONTROL_SIZE_HOVER;
  control.sizeY = EDITOR_CORNER_CONTROL_SIZE_HOVER;
  control.render = createCornerControlRender(key);
}

export function hasDefaultBoxControls(object: FabricObject): boolean {
  return DEFAULT_CORNER_CONTROLS.every((key) => Boolean(object.controls?.[key]));
}
